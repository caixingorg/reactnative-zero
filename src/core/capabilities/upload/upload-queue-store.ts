/**
 * @module core/capabilities/upload/upload-queue-store
 * 职责：跨页面存活的全局上传队列状态机（基于 Zustand vanilla），统一调度多文件排队、并发上限、暂停/恢复、取消与进度汇总。
 * 边界：通过注入 `executeTask` 适配任意上传执行器（普通单文件 UploadService 或 TUS 断点续传上传器），严禁在模块顶层创建全局单例。
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { cleanupTemporaryUploadFile } from './image-compression';
import { UploadError, type UploadProgressEvent } from './upload-service';

export type UploadTaskStatus = 'queued' | 'uploading' | 'paused' | 'done' | 'cancelled' | 'failed';

export interface UploadQueueItemInput {
  id?: string;
  fileUri: string;
  sourceUri?: string;
  isTemporaryFile?: boolean;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface UploadQueueTask {
  id: string;
  fileUri: string;
  sourceUri?: string;
  isTemporaryFile?: boolean;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  bytesSent: number;
  percent: number;
  status: UploadTaskStatus;
  errorMessage?: string;
  resultUrl?: string;
}

export interface UploadQueueTaskExecutionContext {
  task: UploadQueueTask;
  signal: AbortSignal;
  onProgress: (event: UploadProgressEvent) => void;
}

export interface UploadQueueStoreOptions {
  /** 同时处于 uploading 状态的最大并发数，默认 2 */
  concurrency?: number;
  executeTask: (ctx: UploadQueueTaskExecutionContext) => Promise<{ resultUrl?: string } | void>;
  cleanupTemporaryFile?: (uri: string, sourceUri?: string) => void;
}

export interface UploadQueueState {
  tasks: readonly UploadQueueTask[];
  activeCount: number;
  enqueue: (input: UploadQueueItemInput) => string;
  pause: (taskId: string) => void;
  resume: (taskId: string) => void;
  cancel: (taskId: string) => void;
  clearFinished: () => void;
}

export type UploadQueueStore = StoreApi<UploadQueueState>;

export function createUploadQueueStore(options: UploadQueueStoreOptions): UploadQueueStore {
  const maxConcurrency = Math.max(1, options.concurrency ?? 2);
  const cleanup = options.cleanupTemporaryFile ?? cleanupTemporaryUploadFile;
  const controllers = new Map<string, AbortController>();
  const pauseRequested = new Set<string>();
  let sequence = 0;

  const cleanupTaskTempFile = (task: UploadQueueTask): void => {
    const isTemp =
      task.isTemporaryFile === true ||
      (task.sourceUri !== undefined && task.fileUri !== task.sourceUri);
    if (!isTemp) {
      return;
    }
    try {
      cleanup(task.fileUri, task.sourceUri);
    } catch {
      // 临时缓存清理失败不阻断队列调度
    }
  };

  const store = createStore<UploadQueueState>((set, get) => {
    const updateTask = (taskId: string, patch: Partial<UploadQueueTask>): void => {
      set((state) => ({
        tasks: state.tasks.map((item) => (item.id === taskId ? { ...item, ...patch } : item)),
      }));
    };

    const startTask = (task: UploadQueueTask): void => {
      const controller = new AbortController();
      controllers.set(task.id, controller);
      pauseRequested.delete(task.id);

      set((state) => ({
        activeCount: state.activeCount + 1,
        tasks: state.tasks.map((item) =>
          item.id === task.id ? { ...item, status: 'uploading', errorMessage: undefined } : item,
        ),
      }));

      void options
        .executeTask({
          task,
          signal: controller.signal,
          onProgress: ({ bytesSent, totalBytes }) => {
            const total = totalBytes > 0 ? totalBytes : task.sizeBytes;
            const percent = total > 0 ? Math.min(100, Math.round((bytesSent / total) * 100)) : 0;
            updateTask(task.id, { bytesSent, sizeBytes: total, percent });
          },
        })
        .then((res) => {
          updateTask(task.id, {
            status: 'done',
            percent: 100,
            resultUrl: res?.resultUrl,
          });
          cleanupTaskTempFile(task);
        })
        .catch((error: unknown) => {
          if (pauseRequested.has(task.id)) {
            pauseRequested.delete(task.id);
            updateTask(task.id, { status: 'paused' });
            return;
          }
          if (
            controller.signal.aborted ||
            (error instanceof UploadError && error.kind === 'cancelled')
          ) {
            updateTask(task.id, { status: 'cancelled' });
            cleanupTaskTempFile(task);
            return;
          }
          updateTask(task.id, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          controllers.delete(task.id);
          set((state) => ({ activeCount: Math.max(0, state.activeCount - 1) }));
          drainQueue();
        });
    };

    const drainQueue = (): void => {
      while (get().activeCount < maxConcurrency) {
        const nextTask = get().tasks.find((item) => item.status === 'queued');
        if (!nextTask) {
          return;
        }
        startTask(nextTask);
      }
    };

    return {
      tasks: [],
      activeCount: 0,

      enqueue: (input) => {
        sequence += 1;
        const id = input.id ?? `upload-task-${sequence}`;
        const task: UploadQueueTask = {
          id,
          fileUri: input.fileUri,
          ...(input.sourceUri !== undefined ? { sourceUri: input.sourceUri } : {}),
          ...(input.isTemporaryFile !== undefined
            ? { isTemporaryFile: input.isTemporaryFile }
            : {}),
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes ?? 0,
          bytesSent: 0,
          percent: 0,
          status: 'queued',
        };
        set((state) => ({ tasks: [...state.tasks, task] }));
        drainQueue();
        return id;
      },

      pause: (taskId) => {
        const current = get().tasks.find((item) => item.id === taskId);
        if (!current) {
          return;
        }
        if (current.status === 'queued') {
          updateTask(taskId, { status: 'paused' });
          return;
        }
        if (current.status === 'uploading') {
          pauseRequested.add(taskId);
          controllers.get(taskId)?.abort();
        }
      },

      resume: (taskId) => {
        const current = get().tasks.find((item) => item.id === taskId);
        if (!current || (current.status !== 'paused' && current.status !== 'failed')) {
          return;
        }
        updateTask(taskId, { status: 'queued', errorMessage: undefined });
        drainQueue();
      },

      cancel: (taskId) => {
        const current = get().tasks.find((item) => item.id === taskId);
        if (!current || current.status === 'done' || current.status === 'cancelled') {
          return;
        }
        pauseRequested.delete(taskId);
        const controller = controllers.get(taskId);
        if (controller) {
          controller.abort();
        } else {
          updateTask(taskId, { status: 'cancelled' });
          cleanupTaskTempFile(current);
        }
      },

      clearFinished: () => {
        const finished = get().tasks.filter(
          (item) => item.status === 'done' || item.status === 'cancelled',
        );
        for (const item of finished) {
          cleanupTaskTempFile(item);
        }
        set((state) => ({
          tasks: state.tasks.filter(
            (item) => item.status !== 'done' && item.status !== 'cancelled',
          ),
        }));
      },
    };
  });

  return store;
}

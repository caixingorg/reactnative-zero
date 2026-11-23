/**
 * @module core/capabilities/upload/tus-upload-driver
 * 职责：基于开源标准协议客户端 `tus-js-client` 封装大文件流式分片与断点续传上传器；
 * 通过 Expo `FileHandle` 按偏移量分片读取磁盘数据（恒定单片内存占用，绝不整文件入堆），并基于 MMKV 持久化断点 URL。
 * 边界：仅负责客户端 TUS 协议编排与断点存储，不绑定具体业务后端；可通过注入 `httpStack` / `fileReader` 完成纯单元测试。
 */
import * as tus from 'tus-js-client';
import type { HttpClient } from '../../network/types';
import type { KeyValueStorageDriver } from '../../storage/types';
import { UploadError, type UploadProgressEvent } from './upload-service';

export const TUS_URL_STORAGE_KEY = 'upload.tus_urls_v1';
export const DEFAULT_TUS_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;

interface StoredTusUploadRecord {
  fingerprint: string;
  uploadUrl: string | null;
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  urlStorageKey: string;
  parallelUploadUrls: string[] | null;
}

export interface TusFileDescriptor {
  fileUri: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** 可选文件修改时间戳，用于组合断点指纹防同名替换误续传 */
  lastModified?: number;
}

export interface TusResumableUploadRequest extends TusFileDescriptor {
  /** 相对 baseUrl 的 TUS 端点路径，默认 /uploads/tus（传入 endpoint 时忽略） */
  path?: string;
  /** 完整 TUS 服务端端点 URL */
  endpoint?: string;
  chunkSizeBytes?: number;
  headers?: Record<string, string>;
  metadata?: Record<string, string>;
  onProgress?: (event: UploadProgressEvent) => void;
  signal?: AbortSignal;
}

export interface TusResumableUploadResult {
  uploadUrl: string;
  bytesUploaded: number;
}

export interface TusResumableUploaderOptions {
  httpClient: HttpClient;
  keyValueStorage: KeyValueStorageDriver;
  /** 默认分片大小（字节），默认 2MB */
  defaultChunkSizeBytes?: number;
  retryDelays?: number[];
  /** 可注入自定义 FileReader（测试或自定义原生读片器） */
  fileReader?: TusFileReader;
  /** 可注入自定义 HttpStack（测试或自定义原生 HTTP 栈） */
  httpStack?: tus.HttpStack;
}

export interface TusFileSource {
  size: number;
  slice(start: number, end: number): Promise<{ value: Uint8Array | null; done: boolean }>;
  close(): void;
}

export interface TusFileReader {
  openFile(input: unknown, chunkSize: number): Promise<TusFileSource>;
}

// 原因：使用 MMKV 持久化 TUS 断点 URL 与指纹；App 强杀或网络中断后重启上传会自动命中历史记录并从服务端已接收偏移续传
export function createMmkvTusUrlStorage(keyValueStorage: KeyValueStorageDriver): {
  findAllUploads: () => Promise<StoredTusUploadRecord[]>;
  findUploadsByFingerprint: (fingerprint: string) => Promise<StoredTusUploadRecord[]>;
  removeUpload: (urlStorageKey: string) => Promise<void>;
  addUpload: (
    fingerprint: string,
    upload: Omit<StoredTusUploadRecord, 'urlStorageKey' | 'fingerprint'>,
  ) => Promise<string>;
} {
  function readAll(): StoredTusUploadRecord[] {
    const raw = keyValueStorage.getString(TUS_URL_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as StoredTusUploadRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      keyValueStorage.deleteKey(TUS_URL_STORAGE_KEY);
      return [];
    }
  }

  function writeAll(records: StoredTusUploadRecord[]): void {
    if (records.length === 0) {
      keyValueStorage.deleteKey(TUS_URL_STORAGE_KEY);
      return;
    }
    keyValueStorage.setString(TUS_URL_STORAGE_KEY, JSON.stringify(records));
  }

  return {
    async findAllUploads() {
      return readAll();
    },
    async findUploadsByFingerprint(fingerprint: string) {
      return readAll().filter((entry) => entry.fingerprint === fingerprint);
    },
    async removeUpload(urlStorageKey: string) {
      writeAll(readAll().filter((entry) => entry.urlStorageKey !== urlStorageKey));
    },
    async addUpload(fingerprint, upload) {
      const urlStorageKey = `tus::${fingerprint}::${Date.now()}`;
      const records = readAll().filter((entry) => entry.fingerprint !== fingerprint);
      records.push({
        fingerprint,
        urlStorageKey,
        size: upload.size,
        metadata: upload.metadata,
        creationTime: upload.creationTime,
        uploadUrl: upload.uploadUrl,
        parallelUploadUrls: upload.parallelUploadUrls,
      });
      writeAll(records);
      return urlStorageKey;
    },
  };
}

// 原因：利用 expo-file-system 的随机偏移 FileHandle 逐片读取磁盘字节，内存占用恒定在单个 chunkSize，避免大视频读入 JS 堆 OOM
export function createExpoTusFileReader(): TusFileReader {
  return {
    async openFile(input: unknown): Promise<TusFileSource> {
      const descriptor = input as TusFileDescriptor;
      const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
      const file = new FileSystem.File(descriptor.fileUri);
      const handle = file.open();
      const size = descriptor.size > 0 ? descriptor.size : (file.info().size ?? 0);

      return {
        size,
        async slice(start: number, end: number) {
          if (start >= size) {
            return { value: null, done: true };
          }
          const clampedEnd = Math.min(end, size);
          const length = Math.max(0, clampedEnd - start);
          if (length === 0) {
            return { value: null, done: true };
          }
          handle.offset = start;
          const value = await handle.readBytes(length);
          // 原因：tus-js-client 约定 done=true 仅表示已越过文件尾且本次无数据，返回有效分片时必须为 done=false
          return { value, done: false };
        },
        close() {
          try {
            handle.close();
          } catch {
            // 句柄已关闭时忽略
          }
        },
      };
    },
  };
}

export function createTusResumableUploader(options: TusResumableUploaderOptions) {
  const defaultChunkSize = options.defaultChunkSizeBytes ?? DEFAULT_TUS_CHUNK_SIZE_BYTES;
  const retryDelays = options.retryDelays ?? [500, 1000, 2000, 4000];
  const urlStorage = createMmkvTusUrlStorage(options.keyValueStorage);
  const fileReader = options.fileReader ?? createExpoTusFileReader();

  async function resolveAuthHeaders(): Promise<Record<string, string>> {
    try {
      const response = await options.httpClient.executeAuthorized(async (authHeaders) => ({
        status: 200,
        data: authHeaders,
      }));
      return response.data;
    } catch {
      return {};
    }
  }

  return {
    async upload(request: TusResumableUploadRequest): Promise<TusResumableUploadResult> {
      if (request.signal?.aborted) {
        throw new UploadError('cancelled', '上传已取消');
      }

      const endpoint =
        request.endpoint ?? `${options.httpClient.getBaseUrl()}${request.path ?? '/uploads/tus'}`;
      const authHeaders = request.endpoint ? {} : await resolveAuthHeaders();
      const descriptor: TusFileDescriptor = {
        fileUri: request.fileUri,
        fileName: request.fileName,
        mimeType: request.mimeType,
        size: request.size,
        lastModified: request.lastModified,
      };
      const fingerprintValue = [
        descriptor.fileUri,
        descriptor.fileName,
        String(descriptor.size),
        String(descriptor.lastModified ?? 0),
        endpoint,
      ].join('|');

      return new Promise<TusResumableUploadResult>((resolve, reject) => {
        let settled = false;
        let lastBytesUploaded = 0;

        const finishReject = (error: unknown): void => {
          if (settled) {
            return;
          }
          settled = true;
          request.signal?.removeEventListener('abort', handleAbort);
          reject(error);
        };

        const finishResolve = (result: TusResumableUploadResult): void => {
          if (settled) {
            return;
          }
          settled = true;
          request.signal?.removeEventListener('abort', handleAbort);
          resolve(result);
        };

        const upload = new tus.Upload(descriptor as unknown as File, {
          endpoint,
          uploadSize: descriptor.size,
          chunkSize: request.chunkSizeBytes ?? defaultChunkSize,
          retryDelays,
          headers: { ...authHeaders, ...(request.headers ?? {}) },
          metadata: {
            filename: descriptor.fileName,
            filetype: descriptor.mimeType,
            ...(request.metadata ?? {}),
          },
          storeFingerprintForResuming: true,
          removeFingerprintOnSuccess: true,
          urlStorage,
          fileReader,
          ...(options.httpStack ? { httpStack: options.httpStack } : {}),
          fingerprint: async () => fingerprintValue,
          onProgress: (bytesSent, bytesTotal) => {
            lastBytesUploaded = bytesSent;
            request.onProgress?.({ bytesSent, totalBytes: bytesTotal });
          },
          onError: (error) => {
            if (request.signal?.aborted) {
              finishReject(new UploadError('cancelled', '上传已取消'));
              return;
            }
            const detailedStatus =
              'originalResponse' in error && error.originalResponse
                ? error.originalResponse.getStatus()
                : undefined;
            if (detailedStatus && detailedStatus >= 400 && detailedStatus < 500) {
              finishReject(
                new UploadError('rejected', `上传被拒绝 ${detailedStatus}`, detailedStatus),
              );
              return;
            }
            if (detailedStatus && detailedStatus >= 500) {
              finishReject(
                new UploadError('server', `服务端错误 ${detailedStatus}`, detailedStatus),
              );
              return;
            }
            finishReject(new UploadError('network', error.message));
          },
          onSuccess: () => {
            finishResolve({
              uploadUrl: upload.url ?? endpoint,
              bytesUploaded: Math.max(lastBytesUploaded, descriptor.size),
            });
          },
        });

        const handleAbort = (): void => {
          void upload.abort(false).finally(() => {
            finishReject(new UploadError('cancelled', '上传已取消'));
          });
        };

        request.signal?.addEventListener('abort', handleAbort);

        void upload
          .findPreviousUploads()
          .then((previousUploads) => {
            if (request.signal?.aborted) {
              finishReject(new UploadError('cancelled', '上传已取消'));
              return;
            }
            const latest = previousUploads[0];
            if (latest) {
              upload.resumeFromPreviousUpload(latest);
            }
            upload.start();
          })
          .catch((err) => {
            finishReject(
              new UploadError('network', err instanceof Error ? err.message : String(err)),
            );
          });
      });
    },
  };
}

export type TusResumableUploader = ReturnType<typeof createTusResumableUploader>;

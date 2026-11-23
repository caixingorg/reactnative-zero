/**
 * @module core/capabilities/upload/upload-service
 * 职责：带节流进度/ETA、体积守卫、取消、有限重试与对象存储直传（PUT + BINARY_CONTENT）的文件上传引擎；鉴权与 401 刷新复用 HttpClient.executeAuthorized。
 * 边界：只重试网络错误与 5xx（指数退避）；4xx、超限（too_large）与用户取消绝不重试；直传外部预签名 URL 时不附带应用 Bearer Token。
 */
import { AppApiError, type HttpClient } from '../../network/types';

export interface UploadProgressEvent {
  bytesSent: number;
  totalBytes: number;
  /** 平滑上传速率（字节/秒），仅在耗时大于 0 时填充 */
  bytesPerSecond?: number;
  /** 预计剩余时间（毫秒），仅在速率大于 0 时填充 */
  estimatedRemainingMs?: number;
}

export type UploadHttpMethod = 'POST' | 'PUT';
export type UploadTransferType = 'multipart' | 'binary';
export type UploadSessionType = 'foreground' | 'background';

export interface UploadDriverRequest {
  url: string;
  fileUri: string;
  fieldName: string;
  mimeType: string;
  headers: Record<string, string>;
  httpMethod?: UploadHttpMethod;
  uploadType?: UploadTransferType;
  sessionType?: UploadSessionType;
  onProgress?: (event: UploadProgressEvent) => void;
  signal?: AbortSignal;
}

export interface UploadDriverResponse {
  status: number;
  body: string;
}

export interface UploadDriver {
  upload(request: UploadDriverRequest): Promise<UploadDriverResponse>;
}

export type UploadFailureKind = 'cancelled' | 'rejected' | 'network' | 'server' | 'too_large';

export class UploadError extends Error {
  constructor(
    readonly kind: UploadFailureKind,
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface UploadRequest {
  fileUri: string;
  mimeType: string;
  /** 相对 baseUrl 的上传路径，默认 /uploads（传入 url 时忽略） */
  path?: string;
  /** 外部完整直传地址（如 OSS/COS/S3 预签名 URL）；传入后不拼接 baseUrl 且默认不附带应用 Authorization 头 */
  url?: string;
  /** 额外自定义请求头（例如对象存储预签名所需的 Content-Type 或校验头） */
  headers?: Record<string, string>;
  fieldName?: string;
  httpMethod?: UploadHttpMethod;
  uploadType?: UploadTransferType;
  sessionType?: UploadSessionType;
  /** 本地前置体积守卫上限（字节）；超出后直接抛出 UploadError('too_large')，不发网络请求 */
  maxFileSizeBytes?: number;
  /** 已知文件字节数；缺省时由 getFileSize 探测 */
  fileSizeBytes?: number;
  /** 进度回调最小节流间隔（毫秒），默认 100ms（设为 0 关闭节流） */
  progressThrottleMs?: number;
  onProgress?: (event: UploadProgressEvent) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  status: number;
  body: string;
}

export interface UploadServiceOptions {
  httpClient: HttpClient;
  driver: UploadDriver;
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  getFileSize?: (fileUri: string) => Promise<number | undefined>;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_PROGRESS_THROTTLE_MS = 100;

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === 'AbortError');
}

// 原因：原生上传层在高速网络下每秒可回调数十次进度，若直接 setState 会拖垮 JS 线程；
// 此处保证首包、满足时间间隔、以及最终 100% 完成包必达，中间高频抖动自动折叠
function createThrottledProgressHandler(
  onProgress: ((event: UploadProgressEvent) => void) | undefined,
  throttleMs: number,
  now: () => number,
): ((event: UploadProgressEvent) => void) | undefined {
  if (!onProgress) {
    return undefined;
  }
  const startedAt = now();
  let lastEmitAt = -Infinity;
  let lastSent = -1;

  return (event: UploadProgressEvent): void => {
    const currentMs = now();
    const isFirst = lastEmitAt === -Infinity;
    const isFinal = event.totalBytes > 0 && event.bytesSent >= event.totalBytes;
    const elapsedSinceLast = currentMs - lastEmitAt;

    if (!isFirst && !isFinal && throttleMs > 0 && elapsedSinceLast < throttleMs) {
      return;
    }
    if (!isFirst && !isFinal && event.bytesSent === lastSent) {
      return;
    }

    lastEmitAt = currentMs;
    lastSent = event.bytesSent;

    const totalElapsedMs = currentMs - startedAt;
    if (totalElapsedMs > 0 && event.bytesSent > 0) {
      const bytesPerSecond = Math.round((event.bytesSent / totalElapsedMs) * 1000);
      const remainingBytes = Math.max(0, event.totalBytes - event.bytesSent);
      const estimatedRemainingMs =
        bytesPerSecond > 0 ? Math.round((remainingBytes / bytesPerSecond) * 1000) : undefined;
      onProgress({
        bytesSent: event.bytesSent,
        totalBytes: event.totalBytes,
        bytesPerSecond,
        estimatedRemainingMs,
      });
      return;
    }

    onProgress({ bytesSent: event.bytesSent, totalBytes: event.totalBytes });
  };
}

export function createUploadService(options: UploadServiceOptions) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const getFileSize = options.getFileSize ?? readNativeFileSize;

  async function attemptOnce(
    request: UploadRequest,
    throttledProgress?: (event: UploadProgressEvent) => void,
  ): Promise<UploadDriverResponse> {
    const baseDriverReq = {
      fileUri: request.fileUri,
      fieldName: request.fieldName ?? 'file',
      mimeType: request.mimeType,
      httpMethod: request.httpMethod ?? 'POST',
      uploadType: request.uploadType ?? 'multipart',
      sessionType: request.sessionType ?? 'foreground',
      onProgress: throttledProgress,
      signal: request.signal,
    };

    // 原因：外部对象存储（OSS/COS/S3）预签名 URL 严禁附带应用自有 Bearer Authorization 头，否则签名校验会直接返回 400/403
    if (request.url) {
      return options.driver.upload({
        ...baseDriverReq,
        url: request.url,
        headers: { ...(request.headers ?? {}) },
      });
    }

    const url = `${options.httpClient.getBaseUrl()}${request.path ?? '/uploads'}`;
    return options.httpClient.executeAuthorized(async (authHeaders) => {
      const response = await options.driver.upload({
        ...baseDriverReq,
        url,
        headers: { ...authHeaders, ...(request.headers ?? {}) },
      });
      let data: unknown;
      try {
        data = JSON.parse(response.body);
      } catch {
        data = undefined;
      }
      return { ...response, data };
    });
  }

  return {
    async upload(request: UploadRequest): Promise<UploadResult> {
      if (request.signal?.aborted) {
        throw new UploadError('cancelled', '上传已取消');
      }

      if (request.maxFileSizeBytes !== undefined) {
        const sizeBytes = request.fileSizeBytes ?? (await getFileSize(request.fileUri));
        if (sizeBytes !== undefined && sizeBytes > request.maxFileSizeBytes) {
          throw new UploadError(
            'too_large',
            `文件体积超出限制（${sizeBytes} > ${request.maxFileSizeBytes} 字节）`,
          );
        }
      }

      const throttledProgress = createThrottledProgressHandler(
        request.onProgress,
        request.progressThrottleMs ?? DEFAULT_PROGRESS_THROTTLE_MS,
        now,
      );

      let lastFailure: UploadError | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (request.signal?.aborted) {
          throw new UploadError('cancelled', '上传已取消');
        }
        try {
          const response = await attemptOnce(request, throttledProgress);
          if (response.status >= 200 && response.status < 300) {
            return { status: response.status, body: response.body };
          }
          if (response.status < 500) {
            throw new UploadError('rejected', `上传被拒绝 ${response.status}`, response.status);
          }
          lastFailure = new UploadError('server', `服务端错误 ${response.status}`, response.status);
        } catch (error) {
          if (
            error instanceof UploadError &&
            (error.kind === 'rejected' || error.kind === 'too_large')
          ) {
            throw error;
          }
          if (isAbort(error, request.signal)) {
            throw new UploadError('cancelled', '上传已取消');
          }
          // 原因：会话失效等应用级错误不是网络抖动，重试没有意义，原样抛出交给上层处理
          if (error instanceof AppApiError || !(error instanceof Error)) {
            throw error;
          }
          lastFailure = new UploadError('network', error.message);
        }

        if (attempt < maxAttempts) {
          await sleep(baseDelayMs * 2 ** (attempt - 1));
        }
      }

      throw lastFailure ?? new UploadError('network', '上传失败');
    },
  };
}

export type UploadService = ReturnType<typeof createUploadService>;

async function readNativeFileSize(fileUri: string): Promise<number | undefined> {
  try {
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    const file = new FileSystem.File(fileUri);
    const info = file.info();
    return typeof info.size === 'number' ? info.size : undefined;
  } catch {
    return undefined;
  }
}

export function createNativeUploadDriver(): UploadDriver {
  return {
    async upload(request) {
      const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
      const uploadType =
        request.uploadType === 'binary'
          ? FileSystem.UploadType.BINARY_CONTENT
          : FileSystem.UploadType.MULTIPART;
      const task = new FileSystem.UploadTask(new FileSystem.File(request.fileUri), request.url, {
        httpMethod: request.httpMethod ?? 'POST',
        uploadType,
        ...(uploadType === FileSystem.UploadType.MULTIPART ? { fieldName: request.fieldName } : {}),
        mimeType: request.mimeType,
        headers: request.headers,
        sessionType: request.sessionType ?? 'foreground',
        onProgress: request.onProgress,
        signal: request.signal,
      });
      const result = await task.uploadAsync();
      return { status: result.status, body: result.body };
    },
  };
}

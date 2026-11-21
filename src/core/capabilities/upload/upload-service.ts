/**
 * @module core/capabilities/upload/upload-service
 * 职责：带进度、取消与有限重试的单文件上传；鉴权与 401 刷新复用 HttpClient.executeAuthorized。
 * 边界：只重试网络错误与 5xx（指数退避）；4xx 与用户取消绝不重试；不做分片、断点续传与后台上传。
 */
import { AppApiError, type HttpClient } from '../../network/types';

export interface UploadProgressEvent {
  bytesSent: number;
  totalBytes: number;
}

export interface UploadDriverRequest {
  url: string;
  fileUri: string;
  fieldName: string;
  mimeType: string;
  headers: Record<string, string>;
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

export type UploadFailureKind = 'cancelled' | 'rejected' | 'network' | 'server';

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
  /** 相对 baseUrl 的上传路径，默认 /uploads */
  path?: string;
  fieldName?: string;
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
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === 'AbortError');
}

export function createUploadService(options: UploadServiceOptions) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function attemptOnce(request: UploadRequest): Promise<UploadDriverResponse> {
    const url = `${options.httpClient.getBaseUrl()}${request.path ?? '/uploads'}`;
    return options.httpClient.executeAuthorized(async (authHeaders) => {
      const response = await options.driver.upload({
        url,
        fileUri: request.fileUri,
        fieldName: request.fieldName ?? 'file',
        mimeType: request.mimeType,
        headers: authHeaders,
        onProgress: request.onProgress,
        signal: request.signal,
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
      let lastFailure: UploadError | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (request.signal?.aborted) {
          throw new UploadError('cancelled', '上传已取消');
        }
        try {
          const response = await attemptOnce(request);
          if (response.status >= 200 && response.status < 300) {
            return { status: response.status, body: response.body };
          }
          if (response.status < 500) {
            throw new UploadError('rejected', `上传被拒绝 ${response.status}`, response.status);
          }
          lastFailure = new UploadError('server', `服务端错误 ${response.status}`, response.status);
        } catch (error) {
          if (error instanceof UploadError && error.kind === 'rejected') {
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

export function createNativeUploadDriver(): UploadDriver {
  return {
    async upload(request) {
      const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
      const task = new FileSystem.UploadTask(new FileSystem.File(request.fileUri), request.url, {
        httpMethod: 'POST',
        uploadType: FileSystem.UploadType.MULTIPART,
        fieldName: request.fieldName,
        mimeType: request.mimeType,
        headers: request.headers,
        // 原因：前台会话的进度回调与取消更可预期；基础版不承诺 App 退到后台后继续上传
        sessionType: 'foreground',
        onProgress: request.onProgress,
        signal: request.signal,
      });
      const result = await task.uploadAsync();
      return { status: result.status, body: result.body };
    },
  };
}

import type { HttpRequest, HttpResponse, HttpStack } from 'tus-js-client';
import { appIdentity } from '@root/app.identity';
import {
  compressImageForUpload,
  computeResize,
  createTusResumableUploader,
  createUploadQueueStore,
  createUploadService,
  TUS_URL_STORAGE_KEY,
  UploadError,
  type TusFileReader,
  type UploadDriver,
  type UploadDriverRequest,
} from '@/core/capabilities/upload';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

const noPrivacyGateIdentity = {
  ...appIdentity,
  compliance: { ...appIdentity.compliance, requirePrivacyConsent: false },
};

async function createRuntimeWithTokens(refreshHandler?: () => void) {
  const secretStorage = createMemorySecretStorage();
  await secretStorage.setSecret('auth.access_token', 'stale-access-token');
  await secretStorage.setSecret('auth.refresh_token', 'valid-refresh-token');
  const runtime = createTestRuntime({
    identity: noPrivacyGateIdentity,
    env: TEST_RUNTIME_ENV,
    overrides: {
      secretStorage,
      httpTransport: async (req) => {
        if (req.url.endsWith('/auth/refresh')) {
          refreshHandler?.();
          return {
            status: 200,
            headers: {},
            data: {
              code: 0,
              message: 'ok',
              data: { accessToken: 'fresh-access-token', refreshToken: 'fresh-refresh-token' },
            },
          };
        }
        return { status: 404, headers: {}, data: null };
      },
    },
  });
  await runtime.authSessionStore.getState().hydrateSession();
  return runtime;
}

const expiredBody = JSON.stringify({ code: 40101, message: 'Access token expired', data: null });
const okBody = JSON.stringify({ code: 0, message: 'ok', data: { id: 'u-1' } });

function scriptedDriver(responses: (number | Error)[]): {
  driver: UploadDriver;
  calls: UploadDriverRequest[];
} {
  const calls: UploadDriverRequest[] = [];
  const driver: UploadDriver = {
    async upload(request) {
      calls.push(request);
      const next = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (next instanceof Error) {
        throw next;
      }
      return { status: next ?? 200, body: next === 200 ? okBody : '' };
    },
  };
  return { driver, calls };
}

describe('Seam: image compression and single-file upload', () => {
  describe('compression', () => {
    it('only shrinks the long edge when the image exceeds the limit, and never enlarges small images', () => {
      expect(computeResize(4000, 3000, 1600)).toEqual({ width: 1600 });
      expect(computeResize(3000, 4000, 1600)).toEqual({ height: 1600 });
      expect(computeResize(800, 600, 1600)).toBeUndefined();
      expect(computeResize(1600, 1600, 1600)).toBeUndefined();
      // 原因：拿不到原图尺寸时仍按上限缩放，避免把超大图原样上传
      expect(computeResize(undefined, undefined, 1600)).toEqual({ width: 1600 });
    });

    it('always re-encodes to JPEG and clamps quality into a sane range', async () => {
      const compress = jest.fn(async () => ({ uri: 'file:///out.jpg', width: 1600, height: 1200 }));

      const result = await compressImageForUpload(
        { uri: 'file:///photo.heic', width: 4000, height: 3000 },
        { compress },
        { quality: 5 },
      );

      expect(result).toEqual({
        uri: 'file:///out.jpg',
        width: 1600,
        height: 1200,
        mimeType: 'image/jpeg',
      });
      expect(compress).toHaveBeenCalledWith({
        uri: 'file:///photo.heic',
        resize: { width: 1600 },
        quality: 1,
      });
    });
  });

  describe('upload', () => {
    it('refreshes an expired token once through the shared single-flight lock and replays with the new token', async () => {
      let refreshCount = 0;
      const runtime = await createRuntimeWithTokens(() => {
        refreshCount += 1;
      });
      const seenAuth: string[] = [];
      const progress = jest.fn();
      const driver: UploadDriver = {
        async upload(request) {
          seenAuth.push(request.headers.Authorization ?? '');
          request.onProgress?.({ bytesSent: 5, totalBytes: 10 });
          return request.headers.Authorization === 'Bearer fresh-access-token'
            ? { status: 200, body: okBody }
            : { status: 401, body: expiredBody };
        },
      };
      const service = createUploadService({ httpClient: runtime.httpClient, driver });

      const result = await service.upload({
        fileUri: 'file:///a.jpg',
        mimeType: 'image/jpeg',
        onProgress: progress,
      });

      expect(result.status).toBe(200);
      expect(refreshCount).toBe(1);
      expect(seenAuth).toEqual(['Bearer stale-access-token', 'Bearer fresh-access-token']);
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({ bytesSent: 5, totalBytes: 10 }),
      );
    });

    it('retries 5xx with exponential backoff and then succeeds', async () => {
      const runtime = await createRuntimeWithTokens();
      const { driver, calls } = scriptedDriver([503, 502, 200]);
      const sleeps: number[] = [];
      const service = createUploadService({
        httpClient: runtime.httpClient,
        driver,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });

      const result = await service.upload({ fileUri: 'file:///a.jpg', mimeType: 'image/jpeg' });

      expect(result.status).toBe(200);
      expect(calls).toHaveLength(3);
      expect(sleeps).toEqual([500, 1000]);
    });

    it('never retries a 4xx rejection', async () => {
      const runtime = await createRuntimeWithTokens();
      const { driver, calls } = scriptedDriver([413]);
      const service = createUploadService({
        httpClient: runtime.httpClient,
        driver,
        sleep: async () => {},
      });

      await expect(
        service.upload({ fileUri: 'file:///a.jpg', mimeType: 'image/jpeg' }),
      ).rejects.toMatchObject({ kind: 'rejected', httpStatus: 413 });
      expect(calls).toHaveLength(1);
    });

    it('gives up with a network error after the attempt limit', async () => {
      const runtime = await createRuntimeWithTokens();
      const { driver, calls } = scriptedDriver([new Error('Network request failed')]);
      const service = createUploadService({
        httpClient: runtime.httpClient,
        driver,
        maxAttempts: 3,
        sleep: async () => {},
      });

      await expect(
        service.upload({ fileUri: 'file:///a.jpg', mimeType: 'image/jpeg' }),
      ).rejects.toMatchObject({ kind: 'network' });
      expect(calls).toHaveLength(3);
    });

    it('reports cancellation and does not retry when the signal is aborted', async () => {
      const runtime = await createRuntimeWithTokens();
      const controller = new AbortController();
      const calls: number[] = [];
      const driver: UploadDriver = {
        async upload() {
          calls.push(1);
          controller.abort();
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          throw abortError;
        },
      };
      const service = createUploadService({
        httpClient: runtime.httpClient,
        driver,
        sleep: async () => {},
      });

      const failure = await service
        .upload({ fileUri: 'file:///a.jpg', mimeType: 'image/jpeg', signal: controller.signal })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(UploadError);
      expect(failure).toMatchObject({ kind: 'cancelled' });
      expect(calls).toHaveLength(1);
    });

    it('does not start at all when the signal is already aborted', async () => {
      const runtime = await createRuntimeWithTokens();
      const controller = new AbortController();
      controller.abort();
      const { driver, calls } = scriptedDriver([200]);
      const service = createUploadService({ httpClient: runtime.httpClient, driver });

      await expect(
        service.upload({
          fileUri: 'file:///a.jpg',
          mimeType: 'image/jpeg',
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ kind: 'cancelled' });
      expect(calls).toHaveLength(0);
    });

    it('throttles high-frequency progress callbacks while always delivering first and final 100% events', async () => {
      const runtime = await createRuntimeWithTokens();
      let nowMs = 1000;
      const seen: { bytesSent: number; totalBytes: number }[] = [];
      const driver: UploadDriver = {
        async upload(request) {
          // 10 burst callbacks within 30ms (same 10% bucket after first)
          request.onProgress?.({ bytesSent: 100, totalBytes: 1000 });
          nowMs += 5;
          request.onProgress?.({ bytesSent: 102, totalBytes: 1000 });
          nowMs += 5;
          request.onProgress?.({ bytesSent: 104, totalBytes: 1000 });
          nowMs += 120;
          request.onProgress?.({ bytesSent: 500, totalBytes: 1000 });
          nowMs += 10;
          request.onProgress?.({ bytesSent: 1000, totalBytes: 1000 });
          return { status: 200, body: okBody };
        },
      };
      const service = createUploadService({
        httpClient: runtime.httpClient,
        driver,
        now: () => nowMs,
      });

      await service.upload({
        fileUri: 'file:///large.mp4',
        mimeType: 'video/mp4',
        progressThrottleMs: 100,
        onProgress: (event) => {
          seen.push({ bytesSent: event.bytesSent, totalBytes: event.totalBytes });
        },
      });

      expect(seen).toEqual([
        { bytesSent: 100, totalBytes: 1000 },
        { bytesSent: 500, totalBytes: 1000 },
        { bytesSent: 1000, totalBytes: 1000 },
      ]);
    });

    it('rejects oversized files locally with UploadError(too_large) before touching the driver', async () => {
      const runtime = await createRuntimeWithTokens();
      const { driver, calls } = scriptedDriver([200]);
      const service = createUploadService({
        httpClient: runtime.httpClient,
        driver,
        getFileSize: async () => 50 * 1024 * 1024,
      });

      await expect(
        service.upload({
          fileUri: 'file:///huge.mov',
          mimeType: 'video/quicktime',
          maxFileSizeBytes: 20 * 1024 * 1024,
        }),
      ).rejects.toMatchObject({ kind: 'too_large' });
      expect(calls).toHaveLength(0);
    });

    it('supports PUT binary direct uploads to presigned object-storage URLs without leaking app Authorization headers', async () => {
      const runtime = await createRuntimeWithTokens();
      const { driver, calls } = scriptedDriver([200]);
      const service = createUploadService({ httpClient: runtime.httpClient, driver });

      const result = await service.upload({
        url: 'https://bucket.oss-cn-hangzhou.aliyuncs.com/uploads/clip.mp4?Signature=abc',
        fileUri: 'file:///clip.mp4',
        mimeType: 'video/mp4',
        httpMethod: 'PUT',
        uploadType: 'binary',
        sessionType: 'background',
      });

      expect(result.status).toBe(200);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        url: 'https://bucket.oss-cn-hangzhou.aliyuncs.com/uploads/clip.mp4?Signature=abc',
        httpMethod: 'PUT',
        uploadType: 'binary',
        sessionType: 'background',
      });
      expect(calls[0]?.headers.Authorization).toBeUndefined();
    });
  });

  describe('TUS resumable chunked upload (tus-js-client + MMKV)', () => {
    function createInMemoryTusServerStack(options?: { failPatchCallIndex?: number }): {
      httpStack: HttpStack;
      patchOffsets: number[];
      headCalls: number;
    } {
      let currentOffset = 0;
      let patchCallCount = 0;
      const patchOffsets: number[] = [];
      let headCalls = 0;
      const uploadUrl = 'https://api.example.com/uploads/tus/session-1';

      const httpStack: HttpStack = {
        getName: () => 'in-memory-tus-stack',
        createRequest(method: string, url: string): HttpRequest {
          const reqHeaders: Record<string, string> = {};
          let progressCb: ((bytesSent: number) => void) | undefined;
          return {
            getMethod: () => method,
            getURL: () => url,
            setHeader: (header, value) => {
              reqHeaders[header.toLowerCase()] = value;
            },
            getHeader: (header) => reqHeaders[header.toLowerCase()],
            setProgressHandler: (handler) => {
              progressCb = handler;
            },
            abort: async () => {},
            getUnderlyingObject: () => null,
            async send(body: Uint8Array | null): Promise<HttpResponse> {
              if (method === 'POST') {
                const respHeaders: Record<string, string> = {
                  location: uploadUrl,
                  'tus-resumable': '1.0.0',
                };
                return {
                  getStatus: () => 201,
                  getHeader: (h) => respHeaders[h.toLowerCase()],
                  getBody: () => '',
                  getUnderlyingObject: () => null,
                };
              }
              if (method === 'HEAD') {
                headCalls += 1;
                const respHeaders: Record<string, string> = {
                  'upload-offset': String(currentOffset),
                  'upload-length': '12',
                  'tus-resumable': '1.0.0',
                };
                return {
                  getStatus: () => 200,
                  getHeader: (h) => respHeaders[h.toLowerCase()],
                  getBody: () => '',
                  getUnderlyingObject: () => null,
                };
              }
              if (method === 'PATCH') {
                patchCallCount += 1;
                const reqOffset = Number(reqHeaders['upload-offset'] ?? 0);
                patchOffsets.push(reqOffset);
                if (options?.failPatchCallIndex === patchCallCount) {
                  throw new Error('simulated mid-upload network drop');
                }
                const chunkLen = body ? body.byteLength : 0;
                currentOffset = reqOffset + chunkLen;
                progressCb?.(chunkLen);
                const respHeaders: Record<string, string> = {
                  'upload-offset': String(currentOffset),
                  'tus-resumable': '1.0.0',
                };
                return {
                  getStatus: () => 204,
                  getHeader: (h) => respHeaders[h.toLowerCase()],
                  getBody: () => '',
                  getUnderlyingObject: () => null,
                };
              }
              return {
                getStatus: () => 404,
                getHeader: () => undefined,
                getBody: () => '',
                getUnderlyingObject: () => null,
              };
            },
          };
        },
      };

      return {
        httpStack,
        patchOffsets,
        get headCalls() {
          return headCalls;
        },
      };
    }

    const memoryFileReader: TusFileReader = {
      async openFile() {
        const full = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        return {
          size: full.byteLength,
          async slice(start, end) {
            if (start >= full.byteLength) {
              return { value: null, done: true };
            }
            const clampedEnd = Math.min(end, full.byteLength);
            return { value: full.slice(start, clampedEnd), done: false };
          },
          close() {},
        };
      },
    };

    it('streams chunks via tus-js-client, persists checkpoint in MMKV on drop, and resumes via HEAD without re-uploading completed chunks', async () => {
      const runtime = await createRuntimeWithTokens();
      const kv = createMemoryKeyValueStorage();
      const server = createInMemoryTusServerStack({ failPatchCallIndex: 2 });

      // Attempt 1: chunk 1 (offset 0..4) succeeds, chunk 2 (offset 4..8) drops with retryDelays=[]
      const firstUploader = createTusResumableUploader({
        httpClient: runtime.httpClient,
        keyValueStorage: kv,
        retryDelays: [],
        fileReader: memoryFileReader,
        httpStack: server.httpStack,
      });

      await expect(
        firstUploader.upload({
          fileUri: 'file:///big-video.mp4',
          fileName: 'big-video.mp4',
          mimeType: 'video/mp4',
          size: 12,
          chunkSizeBytes: 4,
        }),
      ).rejects.toMatchObject({ kind: 'network' });

      // Checkpoint URL is persisted in MMKV
      expect(kv.getString(TUS_URL_STORAGE_KEY)).toContain('session-1');

      // Attempt 2 (simulating app restart with a fresh uploader sharing the same MMKV):
      // queries HEAD offset=4 and resumes directly from offset 4, skipping chunk 0..4!
      const secondUploader = createTusResumableUploader({
        httpClient: runtime.httpClient,
        keyValueStorage: kv,
        retryDelays: [],
        fileReader: memoryFileReader,
        httpStack: server.httpStack,
      });

      const result = await secondUploader.upload({
        fileUri: 'file:///big-video.mp4',
        fileName: 'big-video.mp4',
        mimeType: 'video/mp4',
        size: 12,
        chunkSizeBytes: 4,
      });

      expect(result).toEqual({
        uploadUrl: 'https://api.example.com/uploads/tus/session-1',
        bytesUploaded: 12,
      });
      expect(server.headCalls).toBe(1);
      // Offsets: 0 (ok), 4 (failed), then resumed at 4 (ok) and 8 (ok) — offset 0 was NEVER re-sent!
      expect(server.patchOffsets).toEqual([0, 4, 4, 8]);
      // Checkpoint is cleaned up from MMKV upon completion
      expect(kv.getString(TUS_URL_STORAGE_KEY)).toBeUndefined();
    });
  });

  describe('global upload queue store (concurrency, pause/resume, cancel)', () => {
    it('enforces max concurrency, supports pause/resume, and cancels queued/active tasks cleanly', async () => {
      const resolvers = new Map<string, () => void>();
      let maxObservedActive = 0;

      const store = createUploadQueueStore({
        concurrency: 2,
        executeTask: ({ task, signal, onProgress }) =>
          new Promise<{ resultUrl: string }>((resolve, reject) => {
            maxObservedActive = Math.max(maxObservedActive, store.getState().activeCount);
            onProgress({ bytesSent: 50, totalBytes: 100 });
            signal.addEventListener('abort', () => {
              reject(new UploadError('cancelled', 'cancelled'));
            });
            resolvers.set(task.id, () => {
              onProgress({ bytesSent: 100, totalBytes: 100 });
              resolve({ resultUrl: `https://cdn.example.com/${task.fileName}` });
            });
          }),
      });

      const id1 = store.getState().enqueue({
        fileUri: 'file:///1.mp4',
        fileName: '1.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 100,
      });
      const id2 = store.getState().enqueue({
        fileUri: 'file:///2.mp4',
        fileName: '2.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 100,
      });
      const id3 = store.getState().enqueue({
        fileUri: 'file:///3.mp4',
        fileName: '3.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 100,
      });

      expect(store.getState().activeCount).toBe(2);
      expect(store.getState().tasks.map((t) => t.status)).toEqual([
        'uploading',
        'uploading',
        'queued',
      ]);

      const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

      // Pause task 2 -> task 3 automatically starts to fill concurrency slot
      store.getState().pause(id2);
      await flush();
      expect(store.getState().tasks.find((t) => t.id === id2)?.status).toBe('paused');
      expect(store.getState().tasks.find((t) => t.id === id3)?.status).toBe('uploading');

      // Complete task 1 -> resume task 2 -> complete task 3 and task 2
      resolvers.get(id1)?.();
      await flush();
      expect(store.getState().tasks.find((t) => t.id === id1)?.status).toBe('done');

      store.getState().resume(id2);
      expect(store.getState().tasks.find((t) => t.id === id2)?.status).toBe('uploading');

      resolvers.get(id3)?.();
      resolvers.get(id2)?.();
      await flush();

      expect(maxObservedActive).toBeLessThanOrEqual(2);
      expect(store.getState().tasks.every((t) => t.status === 'done')).toBe(true);

      store.getState().clearFinished();
      expect(store.getState().tasks).toHaveLength(0);
    });
  });
});

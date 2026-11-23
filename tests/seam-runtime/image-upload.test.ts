import React from 'react';
import { renderHook } from '@testing-library/react-native';
import type { HttpRequest, HttpResponse, HttpStack } from 'tus-js-client';
import { appIdentity } from '@root/app.identity';
import {
  compressImageForUpload,
  computeResize,
  createMediaCompressionCapability,
  createTusResumableUploader,
  createUploadQueueStore,
  createUploadService,
  runUploadWithMediaCleanup,
  TUS_URL_STORAGE_KEY,
  UploadError,
  useUploadCapability,
  type MediaCompressionDriver,
  type TusFileReader,
  type UploadDriver,
  type UploadDriverRequest,
} from '@/core/capabilities/upload';
import { AppRuntimeProvider, type AppRuntime } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

function createRuntimeWrapper(runtime: AppRuntime) {
  const providerProps = {
    runtime,
  } as unknown as React.ComponentProps<typeof AppRuntimeProvider>;
  return function RuntimeWrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    return React.createElement(AppRuntimeProvider, providerProps, children);
  };
}

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

    it('cleans up temporary files on done, cancelled, and clearFinished without deleting paused, failed, or sourceUri files', async () => {
      const cleaned: { uri: string; sourceUri?: string }[] = [];
      const resolvers = new Map<
        string,
        { resolve: (v: { resultUrl?: string }) => void; reject: (e: unknown) => void }
      >();

      const store = createUploadQueueStore({
        concurrency: 2,
        cleanupTemporaryFile: (uri, sourceUri) => {
          cleaned.push({ uri, sourceUri });
        },
        executeTask: ({ task, signal }) =>
          new Promise<{ resultUrl?: string }>((resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new UploadError('cancelled', 'cancelled'));
            });
            resolvers.set(task.id, { resolve, reject });
          }),
      });

      const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

      const doneId = store.getState().enqueue({
        fileUri: 'file:///cache/done-compressed.mp4',
        sourceUri: 'file:///dcim/done-original.mp4',
        isTemporaryFile: true,
        fileName: 'done.mp4',
        mimeType: 'video/mp4',
      });
      const failPauseId = store.getState().enqueue({
        fileUri: 'file:///cache/retry-compressed.mp4',
        sourceUri: 'file:///dcim/retry-original.mp4',
        isTemporaryFile: true,
        fileName: 'retry.mp4',
        mimeType: 'video/mp4',
      });
      const queuedCancelId = store.getState().enqueue({
        fileUri: 'file:///cache/queued-compressed.mp4',
        sourceUri: 'file:///dcim/queued-original.mp4',
        isTemporaryFile: true,
        fileName: 'queued.mp4',
        mimeType: 'video/mp4',
      });
      const sourcePassthroughId = store.getState().enqueue({
        fileUri: 'file:///dcim/passthrough-original.mp4',
        sourceUri: 'file:///dcim/passthrough-original.mp4',
        isTemporaryFile: false,
        fileName: 'passthrough.mp4',
        mimeType: 'video/mp4',
      });

      // Active task 1 succeeds -> cleans up its temp file
      resolvers.get(doneId)?.resolve({ resultUrl: 'https://cdn.example.com/done.mp4' });
      await flush();
      expect(cleaned).toEqual([
        { uri: 'file:///cache/done-compressed.mp4', sourceUri: 'file:///dcim/done-original.mp4' },
      ]);

      // Active task 2 pauses -> temp file MUST be preserved for resume
      store.getState().pause(failPauseId);
      await flush();
      expect(store.getState().tasks.find((t) => t.id === failPauseId)?.status).toBe('paused');
      expect(cleaned).toHaveLength(1);

      // Cancel active task 3 -> cleans up temp file and frees concurrency slot
      store.getState().cancel(queuedCancelId);
      await flush();
      expect(cleaned).toEqual([
        { uri: 'file:///cache/done-compressed.mp4', sourceUri: 'file:///dcim/done-original.mp4' },
        {
          uri: 'file:///cache/queued-compressed.mp4',
          sourceUri: 'file:///dcim/queued-original.mp4',
        },
      ]);

      // Enqueue a queued task while 1 slot is taken by sourcePassthroughId, then resume failPauseId (takes 2nd slot),
      // and cancel the queued task directly without ever starting it
      store.getState().resume(failPauseId);
      const neverStartedQueuedId = store.getState().enqueue({
        fileUri: 'file:///cache/never-started.mp4',
        sourceUri: 'file:///dcim/never-started.mp4',
        isTemporaryFile: true,
        fileName: 'never-started.mp4',
        mimeType: 'video/mp4',
      });
      expect(store.getState().tasks.find((t) => t.id === neverStartedQueuedId)?.status).toBe(
        'queued',
      );
      store.getState().cancel(neverStartedQueuedId);
      expect(cleaned).toHaveLength(3);
      expect(cleaned[2]).toEqual({
        uri: 'file:///cache/never-started.mp4',
        sourceUri: 'file:///dcim/never-started.mp4',
      });

      // Fail task 2 -> temp file MUST be preserved for retry
      resolvers.get(failPauseId)?.reject(new UploadError('network', 'network drop'));
      await flush();
      expect(store.getState().tasks.find((t) => t.id === failPauseId)?.status).toBe('failed');
      expect(cleaned).toHaveLength(3);

      // Source passthrough task finishes -> cleanupTemporaryFile is NOT invoked
      resolvers.get(sourcePassthroughId)?.resolve({ resultUrl: 'https://cdn.example.com/p.mp4' });
      await flush();
      expect(cleaned).toHaveLength(3);

      // clearFinished sweeps only remaining finished/cancelled tasks, never failed/paused tasks
      store.getState().clearFinished();
      expect(store.getState().tasks.map((t) => t.id)).toEqual([failPauseId]);
    });
  });

  describe('mediaCompression capability switch, driver override, and cleanup lifecycle', () => {
    it('returns passthrough without touching the native or override driver when mediaCompression is false or omitted', async () => {
      const driver: MediaCompressionDriver = {
        compressVideo: jest.fn(async () => 'file:///cache/compressed.mp4'),
        compressImage: jest.fn(async () => 'file:///cache/compressed.jpg'),
        getFileSize: jest.fn(async () => 1234),
      };

      const omittedCapabilities = { ...noPrivacyGateIdentity.capabilities };
      delete omittedCapabilities.mediaCompression;

      for (const capabilities of [
        omittedCapabilities,
        { ...noPrivacyGateIdentity.capabilities, mediaCompression: false },
      ]) {
        const runtime = createTestRuntime({
          identity: { ...noPrivacyGateIdentity, capabilities },
          env: TEST_RUNTIME_ENV,
          overrides: {
            capabilities: {
              mediaCompressionDriver: driver,
            },
          },
        });

        const wrapper = createRuntimeWrapper(runtime);
        const { result, unmount } = await renderHook(() => useUploadCapability(), { wrapper });

        expect(result.current.mediaCompressionEnabled).toBe(false);
        expect(result.current.uploadService).toBeDefined();
        expect(result.current.tusUploader).toBeDefined();
        expect(result.current.compressionDriver).toBeDefined();

        const videoResult = await result.current.mediaCompressor.compressVideo('file:///raw.mp4');
        const imageResult = await result.current.mediaCompressor.compressImage('file:///raw.jpg');
        const size = await result.current.mediaCompressor.getFileSize('file:///raw.mp4');

        expect(videoResult).toEqual({
          uri: 'file:///raw.mp4',
          sourceUri: 'file:///raw.mp4',
          isTemporary: false,
          skipped: true,
        });
        expect(imageResult).toEqual({
          uri: 'file:///raw.jpg',
          sourceUri: 'file:///raw.jpg',
          isTemporary: false,
          skipped: true,
        });
        expect(size).toBeUndefined();
        await unmount();
      }

      expect(driver.compressVideo).not.toHaveBeenCalled();
      expect(driver.compressImage).not.toHaveBeenCalled();
      expect(driver.getFileSize).not.toHaveBeenCalled();
    });

    it('resolves mediaCompressionDriver override via AppRuntime when mediaCompression is enabled and forwards video/image options & progress', async () => {
      const driver: MediaCompressionDriver = {
        compressVideo: jest.fn(async (_uri, options) => {
          options?.onProgress?.(0.5);
          options?.onProgress?.(1);
          return 'file:///cache/video-compressed.mp4';
        }),
        compressImage: jest.fn(async (_uri, options) =>
          options?.returnableOutputType === 'base64'
            ? 'ZmFrZQ=='
            : 'file:///cache/img-compressed.jpg',
        ),
        getFileSize: jest.fn(async (targetUri) => (targetUri.endsWith('.mp4') ? 2048000 : 102400)),
      };

      const runtime = createTestRuntime({
        identity: {
          ...noPrivacyGateIdentity,
          capabilities: { ...noPrivacyGateIdentity.capabilities, mediaCompression: true },
        },
        env: TEST_RUNTIME_ENV,
        overrides: {
          capabilities: {
            mediaCompressionDriver: driver,
          },
        },
      });

      const wrapper = createRuntimeWrapper(runtime);
      const { result, unmount } = await renderHook(() => useUploadCapability(), { wrapper });

      expect(result.current.mediaCompressionEnabled).toBe(true);
      const progressValues: number[] = [];

      const videoResult = await result.current.mediaCompressor.compressVideo(
        'file:///dcim/raw.mp4',
        {
          compressionMethod: 'manual',
          maxSize: 1280,
          bitrate: 1_500_000,
          onProgress: (p) => progressValues.push(p),
        },
      );

      expect(videoResult).toEqual({
        uri: 'file:///cache/video-compressed.mp4',
        sourceUri: 'file:///dcim/raw.mp4',
        isTemporary: true,
        skipped: false,
        sizeBytes: 2048000,
      });
      expect(progressValues).toEqual([0.5, 1]);

      const base64Result = await result.current.mediaCompressor.compressImage(
        'file:///dcim/raw.jpg',
        { returnableOutputType: 'base64' },
      );
      expect(base64Result).toEqual({
        uri: 'ZmFrZQ==',
        sourceUri: 'file:///dcim/raw.jpg',
        isTemporary: false,
        skipped: false,
      });

      const imageUriResult = await result.current.mediaCompressor.compressImage(
        'file:///dcim/raw.jpg',
        { maxWidth: 1200, quality: 0.8 },
      );
      expect(imageUriResult).toEqual({
        uri: 'file:///cache/img-compressed.jpg',
        sourceUri: 'file:///dcim/raw.jpg',
        isTemporary: true,
        skipped: false,
        sizeBytes: 102400,
      });
      await unmount();
    });

    it('marks skipped when driver returns original sourceUri and runUploadWithMediaCleanup protects sourceUri while cleaning temp files on success, cancel, and error', async () => {
      const cleaned: { uri: string; sourceUri?: string }[] = [];
      const cap = createMediaCompressionCapability({
        enabled: true,
        driver: {
          compressVideo: async (uri) =>
            uri.includes('small') ? uri : 'file:///cache/compressed-video.mp4',
          compressImage: async (uri) => uri,
        },
      });

      const skipped = await cap.compressVideo('file:///dcim/small.mp4');
      expect(skipped).toEqual({
        uri: 'file:///dcim/small.mp4',
        sourceUri: 'file:///dcim/small.mp4',
        isTemporary: false,
        skipped: true,
      });

      // 1) Passthrough upload: cleanup must NOT be invoked on sourceUri
      const passthroughRes = await runUploadWithMediaCleanup({
        sourceUri: 'file:///dcim/small.mp4',
        prepare: () => cap.compressVideo('file:///dcim/small.mp4'),
        upload: async (prepared) => prepared.uri,
        cleanupTemporaryFile: (uri, sourceUri) => {
          cleaned.push({ uri, sourceUri });
        },
      });
      expect(passthroughRes).toBe('file:///dcim/small.mp4');
      expect(cleaned).toHaveLength(0);

      // 2) Success upload: temp file cleaned up
      await runUploadWithMediaCleanup({
        sourceUri: 'file:///dcim/large.mp4',
        prepare: () => cap.compressVideo('file:///dcim/large.mp4'),
        upload: async () => 'ok',
        cleanupTemporaryFile: (uri, sourceUri) => {
          cleaned.push({ uri, sourceUri });
        },
      });
      expect(cleaned).toEqual([
        { uri: 'file:///cache/compressed-video.mp4', sourceUri: 'file:///dcim/large.mp4' },
      ]);

      // 3) Cancelled upload after prepare: temp file cleaned up and UploadError('cancelled') propagated
      const controller = new AbortController();
      await expect(
        runUploadWithMediaCleanup({
          sourceUri: 'file:///dcim/large.mp4',
          signal: controller.signal,
          prepare: async () => {
            const prepared = await cap.compressVideo('file:///dcim/large.mp4');
            controller.abort();
            return prepared;
          },
          upload: async () => 'never',
          cleanupTemporaryFile: (uri, sourceUri) => {
            cleaned.push({ uri, sourceUri });
            throw new Error('cleanup error should be swallowed');
          },
        }),
      ).rejects.toMatchObject({ kind: 'cancelled' });
      expect(cleaned).toHaveLength(2);

      // 4) Failed upload: temp file cleaned up and original error preserved
      await expect(
        runUploadWithMediaCleanup({
          sourceUri: 'file:///dcim/large.mp4',
          prepare: () => cap.compressVideo('file:///dcim/large.mp4'),
          upload: async () => {
            throw new UploadError('server', '500');
          },
          cleanupTemporaryFile: (uri, sourceUri) => {
            cleaned.push({ uri, sourceUri });
          },
        }),
      ).rejects.toMatchObject({ kind: 'server' });
      expect(cleaned).toHaveLength(3);
    });
  });
});

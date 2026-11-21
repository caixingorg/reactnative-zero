import { appIdentity } from '@root/app.identity';
import {
  compressImageForUpload,
  computeResize,
  createUploadService,
  UploadError,
  type UploadDriver,
  type UploadDriverRequest,
} from '@/core/capabilities/upload';
import { createMemorySecretStorage } from '@/core/storage/memory-storage';
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
      expect(progress).toHaveBeenCalledWith({ bytesSent: 5, totalBytes: 10 });
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
  });
});

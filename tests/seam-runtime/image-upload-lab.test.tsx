import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import type { UploadDriver } from '@/core/capabilities/upload';
import type { PermissionOsDriver } from '@/core/permissions/types';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { CapabilitiesLabScreen } from '@/features/capabilities-lab';
import { appTranslationResources } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

const mockDeletedFiles: string[] = [];
const mockExistingFiles = new Set<string>();

jest.mock('expo-file-system', () => ({
  File: class MockLabFile {
    readonly uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists(): boolean {
      return mockExistingFiles.has(this.uri);
    }
    delete(): void {
      mockDeletedFiles.push(this.uri);
      mockExistingFiles.delete(this.uri);
    }
  },
}));

const permissionDriver: PermissionOsDriver = {
  getStatus: async () => 'granted',
  requestOsPermission: async () => 'granted',
  openSystemSettings: async () => {},
};

function mountLab(uploadDriver: UploadDriver) {
  const compress = jest.fn(async () => ({ uri: 'file:///out.jpg', width: 1600, height: 1200 }));
  const runtime = createTestRuntime({
    identity: {
      ...appIdentity,
      compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
    },
    env: TEST_RUNTIME_ENV,
    translations: appTranslationResources,
    overrides: {
      secretStorage: createMemorySecretStorage(),
      keyValueStorage: createMemoryKeyValueStorage(),
      initialDeviceLocale: 'zh-CN',
      permissionDriver,
      capabilities: {
        media: {
          pickImage: async () => ({ uri: 'file:///photo.heic', width: 4000, height: 3000 }),
          saveToLibrary: async (uri: string) => ({ saved: true, uri }),
        },
        uploadDriver,
        imageCompressionDriver: { compress },
      },
    },
  });
  return { runtime, compress };
}

describe('Seam: image upload card in the Capabilities Lab', () => {
  beforeEach(() => {
    mockDeletedFiles.length = 0;
    mockExistingFiles.clear();
  });

  it('compresses the picked image, shows progress, and reports success', async () => {
    const user = userEvent.setup();
    const uploadDriver: UploadDriver = {
      async upload(request) {
        request.onProgress?.({ bytesSent: 50, totalBytes: 100 });
        return { status: 200, body: JSON.stringify({ code: 0, message: 'ok', data: {} }) };
      },
    };
    const { runtime, compress } = mountLab(uploadDriver);

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('upload-pick'));

    expect(await screen.findByText('上传成功（1600×1200，JPEG）')).toBeTruthy();
    expect(compress).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///photo.heic', resize: { width: 1600 } }),
    );
  });

  it('lets the user cancel an upload in flight', async () => {
    const user = userEvent.setup();
    const uploadDriver: UploadDriver = {
      upload: (request) =>
        new Promise((_resolve, reject) => {
          request.onProgress?.({ bytesSent: 10, totalBytes: 100 });
          request.signal?.addEventListener('abort', () => {
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        }),
    };
    const { runtime } = mountLab(uploadDriver);

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('upload-pick'));
    expect(await screen.findByText('上传中 10%')).toBeTruthy();

    await user.press(screen.getByTestId('upload-cancel'));

    expect(await screen.findByText('上传已取消')).toBeTruthy();
  });

  it('offers a retry after a rejected upload that reuses the already compressed file', async () => {
    const user = userEvent.setup();
    const seenUris: string[] = [];
    let attempt = 0;
    const uploadDriver: UploadDriver = {
      async upload(request) {
        seenUris.push(request.fileUri);
        attempt += 1;
        return attempt === 1
          ? { status: 413, body: '' }
          : { status: 200, body: JSON.stringify({ code: 0, message: 'ok', data: {} }) };
      },
    };
    const { runtime, compress } = mountLab(uploadDriver);

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('upload-pick'));
    expect(await screen.findByText(/上传失败：上传被拒绝 413/)).toBeTruthy();

    await user.press(screen.getByTestId('upload-retry'));

    expect(await screen.findByText('上传成功（1600×1200，JPEG）')).toBeTruthy();
    expect(seenUris).toEqual(['file:///out.jpg', 'file:///out.jpg']);
    expect(compress).toHaveBeenCalledTimes(1);
  });

  it('cleans up temporary compressed file if unmounted while compression is still in flight without deleting source asset', async () => {
    const user = userEvent.setup();
    let resolveCompression!: (val: { uri: string; width: number; height: number }) => void;
    mockExistingFiles.add('file:///photo.heic');
    mockExistingFiles.add('file:///out-late.jpg');

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        permissionDriver,
        capabilities: {
          media: {
            pickImage: async () => ({ uri: 'file:///photo.heic', width: 4000, height: 3000 }),
            saveToLibrary: async (uri: string) => ({ saved: true, uri }),
          },
          uploadDriver: {
            upload: async () => ({
              status: 200,
              body: JSON.stringify({ code: 0, message: 'ok', data: {} }),
            }),
          },
          imageCompressionDriver: {
            compress: () =>
              new Promise((resolve) => {
                resolveCompression = resolve;
              }),
          },
        },
      },
    });

    const view = await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('upload-pick'));
    expect(await screen.findByText('正在压缩图片…')).toBeTruthy();

    await view.unmount();

    await act(async () => {
      resolveCompression({ uri: 'file:///out-late.jpg', width: 1600, height: 1200 });
      await Promise.resolve();
    });

    expect(mockDeletedFiles).toEqual(['file:///out-late.jpg']);
    expect(mockExistingFiles.has('file:///photo.heic')).toBe(true);
  });

  it('never deletes the original source asset when compression returns the source URI', async () => {
    const user = userEvent.setup();
    mockExistingFiles.add('file:///photo.heic');

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        permissionDriver,
        capabilities: {
          media: {
            pickImage: async () => ({ uri: 'file:///photo.heic', width: 800, height: 600 }),
            saveToLibrary: async (uri: string) => ({ saved: true, uri }),
          },
          uploadDriver: {
            upload: async () => ({
              status: 200,
              body: JSON.stringify({ code: 0, message: 'ok', data: {} }),
            }),
          },
          imageCompressionDriver: {
            compress: async () => ({ uri: 'file:///photo.heic', width: 800, height: 600 }),
          },
        },
      },
    });

    const view = await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('upload-pick'));
    expect(await screen.findByText('上传成功（800×600，JPEG）')).toBeTruthy();

    await view.unmount();
    expect(mockDeletedFiles).toEqual([]);
    expect(mockExistingFiles.has('file:///photo.heic')).toBe(true);
  });

  it('preserves original source asset when unmounted while a passthrough upload is still in flight', async () => {
    const user = userEvent.setup();
    let resolveUpload!: (res: { status: number; body: string }) => void;
    let capturedSignal: AbortSignal | undefined;
    mockExistingFiles.add('file:///photo-original.heic');

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        permissionDriver,
        capabilities: {
          media: {
            pickImage: async () => ({
              uri: 'file:///photo-original.heic',
              width: 800,
              height: 600,
            }),
            saveToLibrary: async (uri: string) => ({ saved: true, uri }),
          },
          uploadDriver: {
            upload: (request) => {
              capturedSignal = request.signal;
              return new Promise((resolve) => {
                resolveUpload = resolve;
              });
            },
          },
          imageCompressionDriver: {
            compress: async () => ({
              uri: 'file:///photo-original.heic',
              width: 800,
              height: 600,
            }),
          },
        },
      },
    });

    const view = await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('upload-pick'));
    expect(await screen.findByText('上传中 0%')).toBeTruthy();

    await view.unmount();
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      resolveUpload({ status: 200, body: JSON.stringify({ code: 0, message: 'ok', data: {} }) });
      await Promise.resolve();
    });

    expect(mockDeletedFiles).toEqual([]);
    expect(mockExistingFiles.has('file:///photo-original.heic')).toBe(true);
  });

  it('aborts active temp-file upload on unmount and cleans temp file only after settlement without deleting source asset', async () => {
    const user = userEvent.setup();
    let rejectUpload!: (error: Error) => void;
    let capturedSignal: AbortSignal | undefined;
    mockExistingFiles.add('file:///photo.heic');
    mockExistingFiles.add('file:///out-inflight.jpg');

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        permissionDriver,
        capabilities: {
          media: {
            pickImage: async () => ({ uri: 'file:///photo.heic', width: 4000, height: 3000 }),
            saveToLibrary: async (uri: string) => ({ saved: true, uri }),
          },
          uploadDriver: {
            upload: (request) => {
              capturedSignal = request.signal;
              return new Promise((_resolve, reject) => {
                rejectUpload = reject;
              });
            },
          },
          imageCompressionDriver: {
            compress: async () => ({ uri: 'file:///out-inflight.jpg', width: 1600, height: 1200 }),
          },
        },
      },
    });

    const view = await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('upload-pick'));
    expect(await screen.findByText('上传中 0%')).toBeTruthy();

    await view.unmount();
    expect(capturedSignal?.aborted).toBe(true);
    // Must not delete temp file mid-transfer before upload settles
    expect(mockDeletedFiles).toEqual([]);
    expect(mockExistingFiles.has('file:///out-inflight.jpg')).toBe(true);

    await act(async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      rejectUpload(abortError);
      await Promise.resolve();
    });

    expect(mockDeletedFiles).toEqual(['file:///out-inflight.jpg']);
    expect(mockExistingFiles.has('file:///out-inflight.jpg')).toBe(false);
    expect(mockExistingFiles.has('file:///photo.heic')).toBe(true);
  });

  it('cleans up the prior failed attempt temp file when picking a new image instead of retrying', async () => {
    const user = userEvent.setup();
    let pickAttempt = 0;
    let uploadAttempt = 0;
    mockExistingFiles.add('file:///photo1.heic');
    mockExistingFiles.add('file:///photo2.heic');
    mockExistingFiles.add('file:///out1.jpg');
    mockExistingFiles.add('file:///out2.jpg');

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        permissionDriver,
        capabilities: {
          media: {
            pickImage: async () => {
              pickAttempt += 1;
              return pickAttempt === 1
                ? { uri: 'file:///photo1.heic', width: 4000, height: 3000 }
                : { uri: 'file:///photo2.heic', width: 4000, height: 3000 };
            },
            saveToLibrary: async (uri: string) => ({ saved: true, uri }),
          },
          uploadDriver: {
            upload: async () => {
              uploadAttempt += 1;
              return uploadAttempt === 1
                ? { status: 413, body: '' }
                : { status: 200, body: JSON.stringify({ code: 0, message: 'ok', data: {} }) };
            },
          },
          imageCompressionDriver: {
            compress: async ({ uri }) => ({
              uri: uri === 'file:///photo1.heic' ? 'file:///out1.jpg' : 'file:///out2.jpg',
              width: 1600,
              height: 1200,
            }),
          },
        },
      },
    });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('upload-pick'));
    expect(await screen.findByText(/上传失败：上传被拒绝 413/)).toBeTruthy();
    expect(mockExistingFiles.has('file:///out1.jpg')).toBe(true);

    await user.press(screen.getByTestId('upload-pick'));
    expect(await screen.findByText('上传成功（1600×1200，JPEG）')).toBeTruthy();

    expect(mockDeletedFiles).toEqual(['file:///out1.jpg', 'file:///out2.jpg']);
    expect(mockExistingFiles.has('file:///photo1.heic')).toBe(true);
    expect(mockExistingFiles.has('file:///photo2.heic')).toBe(true);
  });
});

import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { CameraCaptureModal, createCameraCapability } from '@/core/capabilities/camera';
import { createFilesCapability, type FilesCapabilityDriver } from '@/core/capabilities/files';
import type {
  OsPermissionStatus,
  PermissionOsDriver,
  SensitivePermissionKind,
} from '@/core/permissions/types';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { CapabilitiesLabScreen } from '@/features/capabilities-lab';
import { appTranslationResources } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

describe('Seam 1: Permission Rationale coordinator & Media/Files Capability Modules in Capabilities Lab', () => {
  it('shows Permission Rationale before OS prompt, skips OS prompt when cancelled, and mounts live scanner & photo capture after confirmation', async () => {
    const user = userEvent.setup();
    let cameraStatus: OsPermissionStatus = 'undetermined';

    const requestOsPermission = jest.fn(
      async (_kind: SensitivePermissionKind): Promise<OsPermissionStatus> => {
        cameraStatus = 'granted';
        return 'granted';
      },
    );
    const openSystemSettings = jest.fn(async () => {});
    const capturePhoto = jest.fn(async () => ({
      uri: 'file:///tmp/captured-photo.jpg',
    }));

    const permissionDriver: PermissionOsDriver = {
      getStatus: async () => cameraStatus,
      requestOsPermission,
      openSystemSettings,
    };

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          requirePrivacyConsent: false,
          requirePermissionRationale: true,
        },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        permissionDriver,
        capabilities: {
          camera: {
            capturePhoto,
          },
        },
      },
    });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );

    // 1. Trigger camera action -> Permission Rationale modal appears BEFORE OS prompt
    await user.press(screen.getByRole('button', { name: '启动相机/扫码校验' }));
    expect(await screen.findByText('相机权限使用说明')).toBeTruthy();
    expect(requestOsPermission).toHaveBeenCalledTimes(0);

    // 2. Cancel rationale -> OS permission dialog is NOT invoked
    await user.press(screen.getByRole('button', { name: '取消' }));
    expect(requestOsPermission).toHaveBeenCalledTimes(0);
    expect(capturePhoto).toHaveBeenCalledTimes(0);

    // 3. Confirm rationale -> OS prompt fires -> camera capture executes
    await user.press(screen.getByRole('button', { name: '启动相机/扫码校验' }));
    await user.press(await screen.findByRole('button', { name: '继续授权' }));

    expect(requestOsPermission).toHaveBeenCalledTimes(1);
    expect(capturePhoto).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/captured-photo\.jpg/)).toBeTruthy();

    // 4. Open live QR/barcode scanner preview (already granted -> mounts immediately)
    await user.press(screen.getByRole('button', { name: '开启实时扫码预览' }));
    expect(await screen.findByTestId('barcode-scanner-preview')).toBeTruthy();
  });

  it('presents Open System Settings guidance when permission is blocked, renders disabled state when flag is false, and supports sandbox file write + read + share', async () => {
    const user = userEvent.setup();
    const openSystemSettings = jest.fn(async () => {});
    const sandboxFiles = new Map<string, string>();

    const filesDriver: FilesCapabilityDriver = {
      pickDocument: async () => ({ name: 'spec.pdf', uri: 'file:///tmp/spec.pdf' }),
      writeSandboxTextFile: async (fileName, content) => {
        sandboxFiles.set(fileName, content);
        return `file:///sandbox/${fileName}`;
      },
      readSandboxTextFile: async (fileName) => sandboxFiles.get(fileName) ?? null,
      writeTextFileAndShare: async (fileName, content) => {
        sandboxFiles.set(fileName, content);
        return {
          fileUri: `file:///sandbox/${fileName}`,
          shared: true,
        };
      },
    };

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          requirePrivacyConsent: false,
          requirePermissionRationale: true,
        },
        capabilities: {
          ...appIdentity.capabilities,
          camera: false,
          photoLibrary: true,
          filesAndSharing: true,
        },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        permissionDriver: {
          getStatus: async () => 'denied_blocked',
          requestOsPermission: async () => 'denied_blocked',
          openSystemSettings,
        },
        capabilities: {
          files: filesDriver,
        },
      },
    });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );

    // 1. Disabled camera capability displays manifest-stripped hint and hides active trigger
    expect(
      screen.getByText('该能力已在 App Identity 中关闭，原生安装清单已剥离对应敏感权限。'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: '启动相机/扫码校验' })).toBeNull();

    // 2. Permanently blocked photoLibrary permission opens settings guidance modal
    await user.press(screen.getByRole('button', { name: '从相册选择图片' }));
    expect(await screen.findByText('权限已被系统关闭')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: '前往系统设置' }));
    expect(openSystemSettings).toHaveBeenCalledTimes(1);

    // 3. Sandbox file write & share followed by sandbox file read verification
    await user.press(screen.getByRole('button', { name: '写入沙盒并分享' }));
    expect(await screen.findByText(/export\.txt/)).toBeTruthy();

    await user.press(screen.getByRole('button', { name: '读取沙盒文件校验' }));
    expect(await screen.findByText('Enterprise RN Template Diagnostic Export')).toBeTruthy();
  });

  it('shows Rationale again on Android denied_ask_again and queues concurrent dialog requests safely without losing Promises', async () => {
    const user = userEvent.setup();
    const requestOsPermission = jest.fn(async (): Promise<OsPermissionStatus> => 'granted');

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          requirePrivacyConsent: false,
          requirePermissionRationale: true,
        },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        permissionDriver: {
          getStatus: async () => 'denied_ask_again',
          requestOsPermission,
          openSystemSettings: async () => {},
        },
      },
    });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );

    // Fire two concurrent permission requests; neither Promise should be orphaned
    const p1 = runtime.permissionCoordinator.requestPermissionWithRationale({
      kind: 'camera',
      rationale: { title: '第一项权限说明', description: '说明一' },
    });
    const p2 = runtime.permissionCoordinator.requestPermissionWithRationale({
      kind: 'location',
      rationale: { title: '第二项权限说明', description: '说明二' },
    });

    expect(await screen.findByText('第一项权限说明')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: '继续授权' }));

    expect(await screen.findByText('第二项权限说明')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: '继续授权' }));

    const [out1, out2] = await Promise.all([p1, p2]);
    expect(out1.granted).toBe(true);
    expect(out2.granted).toBe(true);
    expect(requestOsPermission).toHaveBeenCalledTimes(2);
  });

  it('resolves pending camera capture Promise to null when CameraCaptureModal unmounts mid-session', async () => {
    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
      },
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
      },
    });
    const camera = createCameraCapability({
      enabled: true,
      permissionCoordinator: runtime.permissionCoordinator,
    });

    const modalMount = await render(
      <AppRuntimeProvider runtime={runtime}>
        <CameraCaptureModal camera={camera} />
      </AppRuntimeProvider>,
    );

    let pendingCapture: Promise<unknown> | undefined;
    await act(async () => {
      pendingCapture = camera.captureSessionStore.getState().openCaptureSession();
    });
    await modalMount.unmount();

    await expect(pendingCapture).resolves.toBeNull();
  });

  it('blocks sandbox path traversal in FilesCapability and handles >64KB byte writes without call-stack overflow', async () => {
    const writtenFiles = new Map<string, string>();
    const files = createFilesCapability({
      enabled: true,
      driver: {
        pickDocument: async () => null,
        writeSandboxTextFile: async (fileName, content) => {
          writtenFiles.set(fileName, content);
          return `file:///cache/${fileName}`;
        },
        readSandboxTextFile: async (fileName) => writtenFiles.get(fileName) ?? null,
        writeTextFileAndShare: async (fileName, content) => {
          writtenFiles.set(fileName, content);
          return { fileUri: `file:///cache/${fileName}`, shared: true };
        },
      },
    });

    await expect(files.writeSandboxTextFile('../evil.txt', 'x')).rejects.toThrow(
      /Invalid sandbox fileName/i,
    );
    await expect(files.readSandboxTextFile('subdir/secret.json')).rejects.toThrow(
      /Invalid sandbox fileName/i,
    );

    const largeBytes = new Uint8Array(100_000).fill(65);
    const uri = await files.writeSandboxBytesFile('large-export.bin', largeBytes);
    expect(uri).toBe('file:///cache/large-export.bin');
    expect(writtenFiles.get('large-export.bin')?.length).toBe(100_000);
  });
});

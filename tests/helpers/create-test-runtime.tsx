import React from 'react';
import { View } from 'react-native';
import { appIdentity } from '@root/app.identity';
import { createControllableNetworkMonitor } from '@/core/network/network-monitor';
import type { PermissionOsDriver } from '@/core/permissions/types';
import {
  createAppRuntime,
  type AppRuntime,
  type AppRuntimeOptions,
  type AppRuntimeOverrides,
} from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { AppText, Box } from '@/core/ui';
import { TEST_RUNTIME_ENV } from './test-env';

// 原因：使用结构化局部契约而非静态导入 @/core/capabilities/*，确保派生项目物理删除任意能力子目录后测试工厂依然零修改通过类型检查
interface TestCameraOverrideShape {
  capturePhoto?: () => Promise<{ uri: string; width?: number; height?: number } | null>;
  ScannerPreviewComponent?: React.ComponentType<{
    height: number;
    borderRadius: number;
    backgroundColor: string;
    onScanned: (payload: { type: string; data: string }) => void;
  }>;
  CapturePreviewComponent?: React.ComponentType;
}

function DefaultTestScannerPreview({
  height,
  borderRadius,
  backgroundColor,
}: {
  height: number;
  borderRadius: number;
  backgroundColor: string;
}): React.JSX.Element {
  return (
    <View
      testID="barcode-scanner-preview"
      style={{ width: '100%', height, borderRadius, backgroundColor }}
    />
  );
}

function DefaultTestCapturePreview(): React.JSX.Element {
  return <View testID="camera-capture-preview" />;
}

interface TestAudioVideoOverrideShape {
  playSampleAudio?: (sourceUri: string) => Promise<{ playing: boolean; sourceUri: string }>;
  releaseAudio?: () => void;
  renderVideoSurface?: (props: {
    sourceUri: string;
    height: number;
    borderRadius: number;
    backgroundColor: string;
  }) => React.JSX.Element;
}

interface TestWebViewOverrideShape {
  renderSurface?: (props: { url: string }) => React.JSX.Element;
}

const DEFAULT_TEST_PERMISSION_DRIVER: PermissionOsDriver = {
  getStatus: async () => 'granted',
  requestOsPermission: async () => 'granted',
  openSystemSettings: async () => {},
};

const DEFAULT_TEST_DEVICE_FEEDBACK = {
  copyToClipboard: async () => {},
  readFromClipboard: async () => '',
  triggerImpact: async () => {},
  getDeviceSummary: () => ({
    brand: 'Simulator',
    modelName: 'TestDevice',
    osName: 'TestOS',
    osVersion: '1.0',
    appVersion: '1.0.0',
  }),
};

// 原因：兑现规格书定义的标准运行时测试接缝工厂 (Seam 1)，统一注入内存存储、零 GC 定时器与无原生桥预览占位，使 src/ 生产代码保持零 NODE_ENV 分支
export function createTestRuntime(options: Partial<AppRuntimeOptions> = {}): AppRuntime {
  const callerOverrides: AppRuntimeOverrides = options.overrides ?? {};
  const callerCapabilities = callerOverrides.capabilities ?? {};

  const cameraOverride = callerCapabilities.camera as TestCameraOverrideShape | undefined;
  const audioVideoOverride = callerCapabilities.audioVideo as
    TestAudioVideoOverrideShape | undefined;
  const webviewOverride = callerCapabilities.webview as TestWebViewOverrideShape | undefined;

  const hasExplicitPermissionDriver = Object.prototype.hasOwnProperty.call(
    callerOverrides,
    'permissionDriver',
  );

  return createAppRuntime({
    identity: options.identity ?? appIdentity,
    env: options.env ?? TEST_RUNTIME_ENV,
    translations: options.translations,
    backendAdapter: options.backendAdapter,
    vendors: options.vendors,
    observability: {
      ...options.observability,
      mirrorLogsToConsole: options.observability?.mirrorLogsToConsole ?? false,
    },
    deferredInitializers: options.deferredInitializers,
    ota: options.ota,
    versionPolicy: options.versionPolicy,
    overrides: {
      ...callerOverrides,
      secretStorage: callerOverrides.secretStorage ?? createMemorySecretStorage(),
      keyValueStorage: callerOverrides.keyValueStorage ?? createMemoryKeyValueStorage(),
      reconcileFreshInstall: callerOverrides.reconcileFreshInstall ?? false,
      queryClientOptions: callerOverrides.queryClientOptions ?? {
        staleTimeMs: 0,
        gcTimeMs: 0,
        retry: false,
      },
      queryPersistenceThrottleMs: callerOverrides.queryPersistenceThrottleMs ?? 0,
      networkMonitor: callerOverrides.networkMonitor ?? createControllableNetworkMonitor(true),
      permissionDriver: hasExplicitPermissionDriver
        ? callerOverrides.permissionDriver
        : DEFAULT_TEST_PERMISSION_DRIVER,
      capabilities: {
        deviceFeedback: DEFAULT_TEST_DEVICE_FEEDBACK,
        ...callerCapabilities,
        camera: {
          capturePhoto: cameraOverride?.capturePhoto ?? (async () => null),
          ScannerPreviewComponent:
            cameraOverride?.ScannerPreviewComponent ?? DefaultTestScannerPreview,
          CapturePreviewComponent:
            cameraOverride?.CapturePreviewComponent ?? DefaultTestCapturePreview,
        } satisfies TestCameraOverrideShape,
        audioVideo: {
          playSampleAudio:
            audioVideoOverride?.playSampleAudio ??
            (async (sourceUri: string) => ({ playing: true, sourceUri })),
          releaseAudio: audioVideoOverride?.releaseAudio,
          renderVideoSurface:
            audioVideoOverride?.renderVideoSurface ??
            (({ height, borderRadius, backgroundColor }) => (
              <View
                testID="standard-video-player"
                style={{ width: '100%', height, borderRadius, backgroundColor }}
              />
            )),
        } satisfies TestAudioVideoOverrideShape,
        webview: {
          renderSurface:
            webviewOverride?.renderSurface ??
            (({ url }) => (
              <Box flex={1} p="md" align="center" justify="center" testID="secure-webview-surface">
                <AppText variant="caption" tone="secondary">
                  {url}
                </AppText>
              </Box>
            )),
        } satisfies TestWebViewOverrideShape,
      },
    },
  });
}

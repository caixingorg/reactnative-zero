import React from 'react';
import { Platform } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY } from '@/core/capabilities/biometrics';
import {
  createNotificationsCapability,
  type ExpoNotificationsSdkLike,
} from '@/core/capabilities/notifications';
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
import { AppText, Button, VStack } from '@/core/ui';
import { useCommercialVendorAdapters } from '@/core/vendors';
import { CapabilitiesLabScreen } from '@/features/capabilities-lab';
import { appTranslationResources } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

describe('Seam 1: Biometrics, Location, Notifications, Audio/Video, Device Feedback & Commercial Vendor Mock Adapters', () => {
  it('coordinates Permission Rationale for Location & Notifications, verifies Biometrics + Clipboard/Haptics + Audio/Video, and exercises Commercial Mock Adapters', async () => {
    const user = userEvent.setup();
    const permissionStates: Partial<Record<SensitivePermissionKind, OsPermissionStatus>> = {
      location: 'undetermined',
      notifications: 'granted',
    };

    const requestOsPermission = jest.fn(
      async (kind: SensitivePermissionKind): Promise<OsPermissionStatus> => {
        permissionStates[kind] = 'granted';
        return 'granted';
      },
    );

    const permissionDriver: PermissionOsDriver = {
      getStatus: async (kind) => permissionStates[kind] ?? 'granted',
      requestOsPermission,
      openSystemSettings: async () => {},
    };

    const secretStorage = createMemorySecretStorage();
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
        secretStorage,
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        permissionDriver,
        capabilities: {
          biometrics: {
            checkSupport: async () => ({ available: true, biometricTypes: ['facial'] }),
            authenticate: async () => ({ authenticated: true }),
          },
          location: {
            getCurrentPosition: async () => ({
              latitude: 31.2304,
              longitude: 121.4737,
              accuracy: 12,
            }),
          },
          notifications: {
            scheduleLocalNotification: async () => ({ notificationId: 'notif-101' }),
            setBadgeCount: async () => true,
            getDevicePushToken: async () => 'expo-push-token-xyz',
          },
          audioVideo: {
            playSampleAudio: async () => ({
              playing: true,
              sourceUri: 'https://media.example.com/chime.mp3',
            }),
          },
          deviceFeedback: {
            copyToClipboard: async () => {},
            readFromClipboard: async () => '剪贴板回读文本',
            triggerImpact: async () => {},
            getDeviceSummary: () => ({
              brand: 'Apple',
              modelName: 'iPhone 17 Pro',
              osName: 'iOS',
              osVersion: '20.0',
              appVersion: '1.0.0',
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

    // 1. Biometric authentication + hardware Keystore secret binding & wipe on sign-out
    await user.press(screen.getByRole('button', { name: '发起生物识别核身' }));
    expect(await screen.findByText(/生物识别通过/)).toBeTruthy();

    await user.press(screen.getByRole('button', { name: '绑定并解锁硬件密钥令牌' }));
    expect(await screen.findByText('keystore:hw-bound-bio-secret')).toBeTruthy();
    expect(secretStorage.requiresBiometricAuth(BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY)).toBe(true);
    await runtime.authSessionStore.getState().clearSession();
    expect(await secretStorage.getSecret(BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY)).toBeNull();

    // 2. Location triggers Permission Rationale first because location starts 'undetermined'
    await user.press(screen.getByRole('button', { name: '获取当前坐标' }));
    expect(await screen.findByText('定位权限使用说明')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: '继续授权' }));
    expect(requestOsPermission).toHaveBeenCalledWith('location');
    expect(await screen.findByText(/31\.2304/)).toBeTruthy();

    // 3. Notifications (already 'granted') schedules immediately and fetches push token
    await user.press(screen.getByRole('button', { name: '触发本地通知并设角标' }));
    expect(await screen.findByText(/notif-101/)).toBeTruthy();

    await user.press(screen.getByRole('button', { name: '获取设备推送令牌' }));
    expect(await screen.findByText(/expo-push-token-xyz/)).toBeTruthy();

    // 4. Audio/Video sample playback & Clipboard + Haptics
    await user.press(screen.getByRole('button', { name: '播放示例音频' }));
    expect(await screen.findByText(/chime\.mp3/)).toBeTruthy();

    await user.press(screen.getByRole('button', { name: '写入剪贴板并震动反馈' }));
    expect(await screen.findByText(/剪贴板回读文本/)).toBeTruthy();

    // 5. Inline Hybrid WebView + Bidirectional JSBridge round-trip (theme & safe area + notice)
    await user.press(screen.getByRole('button', { name: 'H5 请求宿主主题与安全区' }));
    expect(await screen.findByText(/safeAreaInsets/)).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'H5 发送通知至原生宿主' }));
    expect(await screen.findByText('H5 消息桥联调成功')).toBeTruthy();

    // 6. Commercial Mock Adapters (Social Auth + Payment + Map + Vendor Push) work without merchant keys
    await user.press(screen.getByRole('button', { name: '模拟微信登录契约' }));
    expect(await screen.findByText(/mock-wx-code/)).toBeTruthy();

    await user.press(screen.getByRole('button', { name: '模拟收银台支付契约' }));
    expect(await screen.findByText(/mock-tx-/)).toBeTruthy();

    await user.press(screen.getByRole('button', { name: '模拟外部地图导航契约' }));
    expect(await screen.findByText(/mock-map/)).toBeTruthy();

    await user.press(screen.getByRole('button', { name: '模拟厂商推送通道注册' }));
    expect(await screen.findByText(/mock-reg-id-001/)).toBeTruthy();
  });

  it('degrades gracefully when Biometrics, Location, Notifications, and Audio/Video flags are disabled in App Identity', async () => {
    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          requirePrivacyConsent: false,
          requirePermissionRationale: true,
        },
        capabilities: {
          ...appIdentity.capabilities,
          biometrics: false,
          location: false,
          notifications: false,
          audioVideo: false,
        },
      },
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
      },
    });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CapabilitiesLabScreen />
      </AppRuntimeProvider>,
    );

    expect(screen.queryByRole('button', { name: '发起生物识别核身' })).toBeNull();
    expect(screen.queryByRole('button', { name: '获取当前坐标' })).toBeNull();
    expect(screen.queryByRole('button', { name: '触发本地通知并设角标' })).toBeNull();
    expect(screen.queryByRole('button', { name: '播放示例音频' })).toBeNull();
  });

  it('blocks mock payment/auth adapters in production unless a real vendor adapter is explicitly injected via vendors', async () => {
    const user = userEvent.setup();
    const unconfiguredProdRuntime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
      },
      env: {
        ...TEST_RUNTIME_ENV,
        appVariant: 'production',
      },
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
      },
    });

    function ProdCheckoutProbe(): React.JSX.Element {
      const [statusText, setStatusText] = React.useState('idle');
      const vendors = useCommercialVendorAdapters();
      return (
        <CapabilitiesLabProbeButton
          label="发起生产支付"
          statusText={statusText}
          onRun={async () => {
            try {
              const res = await vendors.payment.checkoutOrder({
                channel: 'wechat_pay',
                orderId: 'ORD-PROD-1',
                amountCents: 100,
              });
              setStatusText(`paid:${res.transactionId}`);
            } catch (err) {
              setStatusText(`blocked:${err instanceof Error ? err.name : 'unknown'}`);
            }
          }}
        />
      );
    }

    const firstMount = await render(
      <AppRuntimeProvider runtime={unconfiguredProdRuntime}>
        <ProdCheckoutProbe />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByRole('button', { name: '发起生产支付' }));
    expect(await screen.findByText('blocked:VendorAdapterNotConfiguredError')).toBeTruthy();
    await firstMount.unmount();

    const legacyOverrideProdRuntime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
      },
      env: {
        ...TEST_RUNTIME_ENV,
        appVariant: 'production',
      },
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        capabilities: {
          vendors: {
            payment: {
              checkoutOrder: async () => ({
                status: 'paid',
                transactionId: 'legacy-bypass-tx',
              }),
            },
          },
        },
      },
    });
    const legacyMount = await render(
      <AppRuntimeProvider runtime={legacyOverrideProdRuntime}>
        <ProdCheckoutProbe />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByRole('button', { name: '发起生产支付' }));
    expect(await screen.findByText('blocked:VendorAdapterNotConfiguredError')).toBeTruthy();
    await legacyMount.unmount();

    const configuredProdRuntime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: false, requirePermissionRationale: false },
      },
      env: {
        ...TEST_RUNTIME_ENV,
        appVariant: 'production',
      },
      translations: appTranslationResources,
      vendors: {
        payment: {
          checkoutOrder: async (req) => ({
            status: 'paid',
            transactionId: `real-wx-tx-${req.orderId}`,
          }),
        },
      },
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
      },
    });

    await render(
      <AppRuntimeProvider runtime={configuredProdRuntime}>
        <ProdCheckoutProbe />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByRole('button', { name: '发起生产支付' }));
    expect(await screen.findByText('paid:real-wx-tx-ORD-PROD-1')).toBeTruthy();
  });

  it('retries Android notification channel setup if an earlier channel creation attempt failed', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    let channelAttempts = 0;
    const fakeSdk: ExpoNotificationsSdkLike = {
      AndroidImportance: { HIGH: 4 },
      setNotificationHandler: () => {},
      setNotificationChannelAsync: async () => {
        channelAttempts += 1;
        if (channelAttempts === 1) {
          throw new Error('Transient NotificationManager IPC failure');
        }
        return null;
      },
      getPermissionsAsync: async () => ({ status: 'granted', granted: true }),
      requestPermissionsAsync: async () => ({ status: 'granted', granted: true }),
      scheduleNotificationAsync: async () => 'real-notif-id',
      setBadgeCountAsync: async () => true,
      getDevicePushTokenAsync: async () => ({ data: 'fcm-token' }),
    };

    try {
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
      const capability = createNotificationsCapability({
        enabled: true,
        permissionCoordinator: runtime.permissionCoordinator,
        sdk: fakeSdk,
      });

      await expect(
        capability.scheduleLocalNotificationWithPermission(
          { title: '测试', body: '内容' },
          { title: '通知权限', description: '用途说明' },
        ),
      ).rejects.toThrow('Transient NotificationManager IPC failure');

      const secondAttempt = await capability.scheduleLocalNotificationWithPermission(
        { title: '测试', body: '内容' },
        { title: '通知权限', description: '用途说明' },
      );
      expect(secondAttempt).toEqual({ notificationId: 'real-notif-id' });
      expect(channelAttempts).toBe(2);
    } finally {
      jest.restoreAllMocks();
    }
  });
});

function CapabilitiesLabProbeButton({
  label,
  statusText,
  onRun,
}: {
  label: string;
  statusText: string;
  onRun: () => Promise<void>;
}): React.JSX.Element {
  return (
    <VStack>
      <Button
        label={label}
        onPress={() => {
          void onRun();
        }}
      />
      <AppText>{statusText}</AppText>
    </VStack>
  );
}

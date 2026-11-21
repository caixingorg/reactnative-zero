import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import { DiscoverScreen } from '@/features/discover';
import { HomeStarterScreen } from '@/features/home';
import { MessagesScreen } from '@/features/messages';
import { SettingsScreen } from '@/features/settings';
import { createDemoHttpTransport } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

function createFusionRuntime() {
  let biometricAuthCalls = 0;
  let scheduledNotifications = 0;

  const runtime = createTestRuntime({
    identity: {
      ...appIdentity,
      compliance: {
        ...appIdentity.compliance,
        requirePrivacyConsent: false,
        requirePermissionRationale: false,
      },
    },
    env: TEST_RUNTIME_ENV,
    overrides: {
      httpTransport: createDemoHttpTransport(),
      capabilities: {
        biometrics: {
          checkSupport: async () => ({ available: true, biometricTypes: ['facial'] }),
          authenticate: async () => {
            biometricAuthCalls += 1;
            return { authenticated: true };
          },
        },
        notifications: {
          scheduleLocalNotification: async () => {
            scheduledNotifications += 1;
            return { notificationId: 'notif-1' };
          },
          setBadgeCount: async () => true,
          getDevicePushToken: async () => 'token-1',
        },
      },
    },
  });

  return {
    runtime,
    getBiometricAuthCalls: () => biometricAuthCalls,
    getScheduledNotifications: () => scheduledNotifications,
  };
}

describe('Seam: Capability fusion across main tabs and Settings', () => {
  it('renders scan button, QuickComposerCard on 关注, and H5 banner on 热榜 in HomeStarterScreen', async () => {
    const { runtime } = createFusionRuntime();
    let webViewOpened = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <HomeStarterScreen
          onOpenWebView={() => {
            webViewOpened += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByTestId('home-scan-button')).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: '关注' }));
    expect(await screen.findByTestId('quick-composer-card')).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: '热榜' }));
    const banner = await screen.findByTestId('home-trending-banner');
    await fireEvent.press(banner);
    expect(webViewOpened).toBe(1);
  });

  it('renders 6-tile tools grid on 广场 and QuickMusicBar on 榜单 in DiscoverScreen', async () => {
    const { runtime } = createFusionRuntime();

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <DiscoverScreen />
      </AppRuntimeProvider>,
    );

    expect(await screen.findByTestId('discover-tools-grid')).toBeTruthy();
    expect(screen.getByTestId('discover-tool-scan')).toBeTruthy();
    expect(screen.getByTestId('discover-tool-location')).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: '榜单' }));
    expect(await screen.findByTestId('quick-music-bar')).toBeTruthy();
  });

  it('triggers local test notification from MessagesScreen 通知 banner', async () => {
    const { runtime, getScheduledNotifications } = createFusionRuntime();

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <MessagesScreen />
      </AppRuntimeProvider>,
    );

    const notifyBtn = await screen.findByTestId('messages-send-test-notify-btn');
    await fireEvent.press(notifyBtn);
    await waitFor(() => {
      expect(getScheduledNotifications()).toBe(1);
    });
  });

  it('authenticates with biometrics when enabling biometric lock in SettingsScreen', async () => {
    const { runtime, getBiometricAuthCalls } = createFusionRuntime();

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SettingsScreen />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByTestId('settings-biometrics-switch'));
    await waitFor(() => {
      expect(getBiometricAuthCalls()).toBe(1);
    });
  });
});

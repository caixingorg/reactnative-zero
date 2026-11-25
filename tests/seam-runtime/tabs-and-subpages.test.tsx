import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import { pageActionsRegistry } from '@/core/ui';
import { DiscoverScreen } from '@/features/discover';
import { MessagesScreen, useMessagesUnreadStore } from '@/features/messages';
import { ProfileScreen } from '@/features/profile';
import { SettingsScreen } from '@/features/settings';
import { BiometricLockOverlayGate } from '@/features/shell';
import { createMockHttpTransport } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

function createRuntime() {
  return createTestRuntime({
    identity: {
      ...appIdentity,
      compliance: {
        ...appIdentity.compliance,
        requirePrivacyConsent: false,
      },
    },
    env: TEST_RUNTIME_ENV,
    overrides: {
      initialDeviceLocale: 'zh-CN',
      httpTransport: createMockHttpTransport(),
    },
  });
}

describe('Seam: Discover, Messages, and Profile 3-tab skeletons', () => {
  it('renders DiscoverScreen without drawer button, with 广场/榜单/专题 lazy tabs and reselect registration', async () => {
    const runtime = createRuntime();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <DiscoverScreen />
      </AppRuntimeProvider>,
    );

    expect(screen.queryByTestId('discover-drawer-button')).toBeNull();

    expect(screen.getByTestId('discover-tab-categories')).toBeTruthy();
    expect(screen.queryByTestId('discover-tab-rankings')).toBeNull();
    expect(screen.queryByTestId('discover-tab-topics')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: '榜单' }));
    await waitFor(() => expect(screen.getByTestId('discover-tab-rankings')).toBeTruthy());

    await fireEvent.press(screen.getByRole('tab', { name: '专题' }));
    await waitFor(() => expect(screen.getByTestId('discover-tab-topics')).toBeTruthy());

    expect(pageActionsRegistry.reselect()).toBe('refreshed');
  });

  it('renders MessagesScreen without drawer button, with unread badges/dot and 通知/互动/私信 lazy tabs', async () => {
    const runtime = createRuntime();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <MessagesScreen />
      </AppRuntimeProvider>,
    );

    expect(screen.queryByTestId('messages-drawer-button')).toBeNull();

    expect(screen.getByTestId('top-tab-badge-notifications')).toBeTruthy();
    expect(screen.getByTestId('top-tab-dot-interactions')).toBeTruthy();
    expect(screen.getByTestId('top-tab-badge-direct')).toBeTruthy();

    expect(screen.getByTestId('messages-tab-notifications')).toBeTruthy();
    expect(screen.queryByTestId('messages-tab-interactions')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: '互动' }));
    await waitFor(() => expect(screen.getByTestId('messages-tab-interactions')).toBeTruthy());

    await fireEvent.press(screen.getByRole('tab', { name: '私信' }));
    await waitFor(() => expect(screen.getByTestId('messages-tab-direct')).toBeTruthy());

    // Mark all read clears unread badge counts cleanly
    expect(useMessagesUnreadStore.getState().unreadCounts.notifications).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('messages-mark-all-read'));
    expect(useMessagesUnreadStore.getState().unreadCounts).toEqual({
      notifications: 0,
      interactions: 0,
      direct: 0,
    });
  });

  afterEach(async () => {
    await act(async () => {
      useMessagesUnreadStore.getState().resetUnread();
    });
  });

  it('renders ProfileScreen without drawer button, with settings trigger and 收藏/历史/动态 lazy tabs', async () => {
    const runtime = createRuntime();
    let settingsOpened = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <ProfileScreen
          onOpenSettings={() => {
            settingsOpened += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.queryByTestId('profile-drawer-button')).toBeNull();

    await fireEvent.press(screen.getByTestId('profile-settings-button'));
    expect(settingsOpened).toBe(1);

    expect(screen.getByTestId('profile-tab-favorites')).toBeTruthy();
    expect(screen.queryByTestId('profile-tab-history')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: '历史' }));
    await waitFor(() => expect(screen.getByTestId('profile-tab-history')).toBeTruthy());

    await fireEvent.press(screen.getByRole('tab', { name: '动态' }));
    await waitFor(() => expect(screen.getByTestId('profile-tab-activity')).toBeTruthy());
  });
});

describe('Seam: SettingsScreen developer lab entry and stack back header', () => {
  it('navigates to developer capabilities lab and supports stack back button', async () => {
    const runtime = createRuntime();
    let labOpened = 0;
    let backCount = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SettingsScreen
          onBack={() => {
            backCount += 1;
          }}
          onOpenDeveloperLab={() => {
            labOpened += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByTestId('app-header-back-btn'));
    expect(backCount).toBe(1);

    await fireEvent.press(screen.getByTestId('settings-developer-lab-btn'));
    expect(labOpened).toBe(1);
  });

  it('persists biometric lock preference across remounts, enforces BiometricLockOverlayGate, and supports revoking privacy consent from SettingsScreen', async () => {
    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          ...appIdentity.compliance,
          requirePrivacyConsent: true,
        },
      },
      env: TEST_RUNTIME_ENV,
      overrides: {
        httpTransport: createMockHttpTransport(),
        capabilities: {
          biometrics: {
            checkSupport: async () => ({ available: true, biometricTypes: ['facial'] }),
            authenticate: async () => ({ authenticated: true }),
          },
        },
      },
    });
    runtime.privacyGateStore.getState().acceptPrivacyPolicy();
    await runtime.authSessionStore.getState().establishSession({
      tokens: { accessToken: 'tok-1', refreshToken: 'ref-1' },
      user: { id: 'u1', username: 'admin', displayName: '管理员' },
    });
    expect(runtime.privacyGateStore.getState().phase).toBe('ready');

    const firstMount = await render(
      <AppRuntimeProvider runtime={runtime}>
        <SettingsScreen />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByTestId('settings-biometrics-switch'));
    await waitFor(() => {
      expect(runtime.preferencesStore.getState().biometricLockEnabled).toBe(true);
    });

    // Unmount and remount SettingsScreen + BiometricLockOverlayGate: switch remains true and lock overlay protects session on cold mount
    await firstMount.unmount();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SettingsScreen />
        <BiometricLockOverlayGate />
      </AppRuntimeProvider>,
    );
    expect(screen.getByTestId('settings-biometrics-switch').props.accessibilityState?.checked).toBe(
      true,
    );
    expect(screen.getByTestId('biometric-lock-overlay')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('biometric-lock-unlock-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('biometric-lock-overlay')).toBeNull();
    });

    // Revoke privacy consent via ConfirmDialog
    await fireEvent.press(screen.getByTestId('settings-revoke-privacy-btn'));
    expect(await screen.findByText('确认撤回隐私政策授权？')).toBeTruthy();
    await fireEvent.press(screen.getByText('确认撤回'));
    expect(runtime.privacyGateStore.getState().phase).toBe('awaiting-consent');
  });
});

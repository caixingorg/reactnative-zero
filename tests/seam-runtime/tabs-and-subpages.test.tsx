import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import { pageActionsRegistry } from '@/core/ui';
import { DiscoverScreen } from '@/features/discover';
import { MessagesScreen } from '@/features/messages';
import { ProfileScreen } from '@/features/profile';
import { SettingsScreen } from '@/features/settings';
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
  });
}

describe('Seam: Discover, Messages, and Profile 3-tab skeletons', () => {
  it('renders DiscoverScreen with drawer button, 分类/榜单/专题 lazy tabs, and reselect registration', async () => {
    const runtime = createRuntime();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <DiscoverScreen />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByTestId('discover-drawer-button'));
    expect(runtime.drawerStore.getState().isOpen).toBe(true);

    expect(screen.getByTestId('discover-tab-categories')).toBeTruthy();
    expect(screen.queryByTestId('discover-tab-rankings')).toBeNull();
    expect(screen.queryByTestId('discover-tab-topics')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: '榜单' }));
    await waitFor(() => expect(screen.getByTestId('discover-tab-rankings')).toBeTruthy());

    await fireEvent.press(screen.getByRole('tab', { name: '专题' }));
    await waitFor(() => expect(screen.getByTestId('discover-tab-topics')).toBeTruthy());

    expect(pageActionsRegistry.reselect()).toBe('refreshed');
  });

  it('renders MessagesScreen with unread badges/dot and 通知/互动/私信 lazy tabs', async () => {
    const runtime = createRuntime();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <MessagesScreen />
      </AppRuntimeProvider>,
    );

    await fireEvent.press(screen.getByTestId('messages-drawer-button'));
    expect(runtime.drawerStore.getState().isOpen).toBe(true);

    expect(screen.getByTestId('top-tab-badge-notifications')).toBeTruthy();
    expect(screen.getByTestId('top-tab-dot-interactions')).toBeTruthy();
    expect(screen.getByTestId('top-tab-badge-direct')).toBeTruthy();

    expect(screen.getByTestId('messages-tab-notifications')).toBeTruthy();
    expect(screen.queryByTestId('messages-tab-interactions')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: '互动' }));
    await waitFor(() => expect(screen.getByTestId('messages-tab-interactions')).toBeTruthy());

    await fireEvent.press(screen.getByRole('tab', { name: '私信' }));
    await waitFor(() => expect(screen.getByTestId('messages-tab-direct')).toBeTruthy());
  });

  it('renders ProfileScreen with drawer button, settings trigger, and 收藏/历史/动态 lazy tabs', async () => {
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

    await fireEvent.press(screen.getByTestId('profile-drawer-button'));
    expect(runtime.drawerStore.getState().isOpen).toBe(true);

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
});

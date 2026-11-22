import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import { HomeStarterScreen } from '@/features/home';
import { createMockHttpTransport } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

function createHomeRuntime() {
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
      httpTransport: createMockHttpTransport(),
    },
  });
}

describe('Seam: Home vertical slice (Header + Drawer trigger + TopTabs + TabPager + PageTemplate)', () => {
  it('opens the global drawer from the home header button', async () => {
    const runtime = createHomeRuntime();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <HomeStarterScreen />
      </AppRuntimeProvider>,
    );

    expect(runtime.drawerStore.getState().isOpen).toBe(false);
    await fireEvent.press(screen.getByTestId('home-drawer-button'));
    expect(runtime.drawerStore.getState().isOpen).toBe(true);
  });

  it('switches between 推荐, 关注, and 热榜 tabs with lazy mounting', async () => {
    const runtime = createHomeRuntime();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <HomeStarterScreen />
      </AppRuntimeProvider>,
    );

    const recTab = screen.getByRole('tab', { name: '推荐' });
    const followTab = screen.getByRole('tab', { name: '关注' });
    const hotTab = screen.getByRole('tab', { name: '热榜' });

    expect(recTab.props.accessibilityState).toEqual({ selected: true });
    expect(screen.queryByTestId('home-tab-following')).toBeNull();
    expect(screen.queryByTestId('home-tab-trending')).toBeNull();

    await fireEvent.press(followTab);
    await waitFor(() => {
      expect(screen.getByTestId('home-tab-following')).toBeTruthy();
    });
    expect(followTab.props.accessibilityState).toEqual({ selected: true });
    expect(screen.queryByTestId('home-tab-trending')).toBeNull();

    await fireEvent.press(hotTab);
    await waitFor(() => {
      expect(screen.getByTestId('home-tab-trending')).toBeTruthy();
    });
    expect(hotTab.props.accessibilityState).toEqual({ selected: true });
    // Previously visited tab stays mounted
    expect(screen.getByTestId('home-tab-following')).toBeTruthy();
  });
});

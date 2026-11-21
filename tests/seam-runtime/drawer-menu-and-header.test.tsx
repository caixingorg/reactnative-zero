import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { AppRuntimeProvider } from '@/core/runtime';
import { AppHeader } from '@/core/ui';
import { DrawerMenu, type DrawerNavTarget } from '@/features/shell';
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

describe('Seam: DrawerMenu', () => {
  it('shows authenticated user profile, navigates and auto-closes on menu press', async () => {
    const runtime = createRuntime();
    await runtime.authSessionStore.getState().establishSession({
      user: { id: 'u-1', username: 'alice', displayName: '林晚' },
      tokens: { accessToken: 'tok-1', refreshToken: 'ref-1' },
    });

    const navigated: DrawerNavTarget[] = [];
    let closeCount = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <DrawerMenu
          versionLabel="1.2.3"
          onNavigate={(target) => {
            navigated.push(target);
          }}
          onClose={() => {
            closeCount += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('林晚')).toBeTruthy();
    expect(screen.getByText('@alice')).toBeTruthy();
    expect(screen.getByText('v1.2.3')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('drawer-profile-entry'));
    await fireEvent.press(screen.getByText('收藏'));
    await fireEvent.press(screen.getByText('历史'));
    await fireEvent.press(screen.getByText('设置'));
    await fireEvent.press(screen.getByText('意见反馈'));
    await fireEvent.press(screen.getByText('关于'));

    expect(navigated).toEqual(['profile', 'favorites', 'history', 'settings', 'feedback', 'about']);
    expect(closeCount).toBe(6);
  });

  it('shows sign-in entry and hides sign-out button when unauthenticated', async () => {
    const runtime = createRuntime();
    const navigated: DrawerNavTarget[] = [];
    let closeCount = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <DrawerMenu
          onNavigate={(target) => {
            navigated.push(target);
          }}
          onClose={() => {
            closeCount += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('去登录')).toBeTruthy();
    expect(screen.queryByText('退出登录')).toBeNull();

    await fireEvent.press(screen.getByTestId('drawer-profile-entry'));
    expect(navigated).toEqual(['login']);
    expect(closeCount).toBe(1);
  });

  it('toggles dark mode preference and signs out authenticated user', async () => {
    const runtime = createRuntime();
    await runtime.authSessionStore.getState().establishSession({
      user: { id: 'u-2', username: 'bob', displayName: '陈明' },
      tokens: { accessToken: 'tok-2', refreshToken: 'ref-2' },
    });

    let closed = false;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <DrawerMenu
          onClose={() => {
            closed = true;
          }}
        />
      </AppRuntimeProvider>,
    );

    const darkSwitch = screen.getByTestId('drawer-dark-mode-switch');
    await fireEvent.press(darkSwitch);
    expect(runtime.preferencesStore.getState().themePreference).toBe('dark');

    await fireEvent.press(darkSwitch);
    expect(runtime.preferencesStore.getState().themePreference).toBe('light');

    await fireEvent.press(screen.getByText('退出登录'));
    await waitFor(() => {
      expect(runtime.authSessionStore.getState().status).toBe('unauthenticated');
    });
    expect(closed).toBe(true);
  });
});

describe('Seam: AppHeader', () => {
  it('renders title, subtitle, left and right actions and invokes callbacks', async () => {
    const runtime = createRuntime();
    let leftPressed = 0;
    let rightPressed = 0;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <AppHeader
          title="首页"
          subtitle="最新动态"
          leftAction={{
            icon: <Text>M</Text>,
            accessibilityLabel: '打开菜单',
            onPress: () => {
              leftPressed += 1;
            },
            testID: 'header-menu-btn',
          }}
          rightActions={[
            {
              key: 'search',
              label: '搜索',
              accessibilityLabel: '搜索',
              onPress: () => {
                rightPressed += 1;
              },
              testID: 'header-search-btn',
            },
          ]}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('首页')).toBeTruthy();
    expect(screen.getByText('最新动态')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('header-menu-btn'));
    await fireEvent.press(screen.getByTestId('header-search-btn'));
    expect(leftPressed).toBe(1);
    expect(rightPressed).toBe(1);
  });

  it('supports back button, large-title collapse on scroll, and transparent variant', async () => {
    const runtime = createRuntime();
    let backCount = 0;

    const { rerender } = await render(
      <AppRuntimeProvider runtime={runtime}>
        <AppHeader
          title="发现"
          variant="large"
          scrollOffsetY={0}
          showBack
          onBack={() => {
            backCount += 1;
          }}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByTestId('app-header-large-title')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('app-header-back-btn'));
    expect(backCount).toBe(1);

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <AppHeader title="发现" variant="large" scrollOffsetY={48} showBack />
      </AppRuntimeProvider>,
    );
    expect(screen.queryByTestId('app-header-large-title')).toBeNull();
    expect(screen.getByTestId('app-header-compact-title')).toBeTruthy();

    await rerender(
      <AppRuntimeProvider runtime={runtime}>
        <AppHeader title="详情" variant="transparent" showBack />
      </AppRuntimeProvider>,
    );
    expect(screen.getByTestId('app-header').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: 'transparent', position: 'absolute' }),
      ]),
    );
  });
});

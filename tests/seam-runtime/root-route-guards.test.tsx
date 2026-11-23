import React from 'react';
import { Text } from 'react-native';
import { userEvent } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { appIdentity } from '@root/app.identity';
import { GuardedRootStack } from '@/app/_layout';
import WebViewRoute from '@/app/webview';
import {
  ACCESS_TOKEN_SECRET_KEY,
  INSTALL_SESSION_MARKER_KEY,
  REFRESH_TOKEN_SECRET_KEY,
  USER_PROFILE_SECRET_KEY,
} from '@/core/auth/auth-session-store';
import { ACCEPTED_PRIVACY_VERSION_KEY } from '@/core/bootstrap/privacy-gate-store';
import { AppRuntimeProvider, type AppRuntime } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { createTestRuntime } from '../helpers/create-test-runtime';

function createFreshInstallRuntime(): AppRuntime {
  return createTestRuntime({
    overrides: {
      keyValueStorage: createMemoryKeyValueStorage(),
      secretStorage: createMemorySecretStorage(),
      initialDeviceLocale: 'zh-CN',
    },
  });
}

// 原因：路由名必须与 src/app 真实文件树逐一对应——expo-router 在初始路由被守卫拦截时，
// 会按文件系统排序（而非 Stack 声明顺序）挑选首个未受保护的路由作为回退目标，
// 只有挂载真实 GuardedRootStack + 同名路由树才能复现冷启动真机行为
function createRouteTree(
  runtime: AppRuntime,
  webviewRoute: React.ComponentType = () => <Text>webview-screen</Text>,
) {
  return {
    _layout: () => (
      <AppRuntimeProvider runtime={runtime}>
        <GuardedRootStack />
      </AppRuntimeProvider>
    ),
    index: () => <Text>home-index-screen</Text>,
    'privacy-consent': () => <Text>privacy-consent-screen</Text>,
    webview: webviewRoute,
    register: () => <Text>register-screen</Text>,
    '(auth)/login': () => <Text>login-screen</Text>,
    '(tabs)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(tabs)/index': () => <Text>tabs-home-screen</Text>,
    'feed/[id]': () => <Text>feed-detail-screen</Text>,
    settings: () => <Text>settings-screen</Text>,
    'developer-lab': () => <Text>developer-lab-screen</Text>,
    list: () => <Text>list-screen</Text>,
    detail: () => <Text>detail-screen</Text>,
    search: () => <Text>search-screen</Text>,
    form: () => <Text>form-screen</Text>,
    checkout: () => <Text>checkout-screen</Text>,
    status: () => <Text>status-screen</Text>,
  };
}

describe('Seam: root route guards on real cold start', () => {
  it('lands a fresh install on login (where consent checkbox lives) instead of the unguarded webview route', async () => {
    const runtime = createFreshInstallRuntime();

    const router = await renderRouter(createRouteTree(runtime), { initialUrl: '/' });

    expect(await screen.findByText('login-screen')).toBeTruthy();
    expect(screen.queryByText('webview-screen')).toBeNull();
    expect(router.getPathname()).toBe('/login');
  });

  it('hydrates stored session on cold start when privacyPolicyVersion bumps and redirects upgraded logged-in user to /privacy-consent instead of /login', async () => {
    const kv = createMemoryKeyValueStorage();
    kv.setBoolean(INSTALL_SESSION_MARKER_KEY, true);
    kv.setString(ACCEPTED_PRIVACY_VERSION_KEY, '1.0.0');

    const secrets = createMemorySecretStorage();
    await secrets.setSecret(ACCESS_TOKEN_SECRET_KEY, 'persisted-access-token');
    await secrets.setSecret(REFRESH_TOKEN_SECRET_KEY, 'persisted-refresh-token');
    await secrets.setSecret(
      USER_PROFILE_SECRET_KEY,
      JSON.stringify({ id: 'u1', username: 'admin', displayName: 'Admin' }),
    );

    const upgradedRuntime = createTestRuntime({
      identity: {
        ...appIdentity,
        privacyPolicyVersion: '2.0.0',
      },
      overrides: {
        keyValueStorage: kv,
        secretStorage: secrets,
        reconcileFreshInstall: true,
        initialDeviceLocale: 'zh-CN',
      },
    });

    expect(upgradedRuntime.authSessionStore.getState().status).toBe('hydrating');
    expect(upgradedRuntime.privacyGateStore.getState().phase).toBe('awaiting-consent');

    const router = await renderRouter(createRouteTree(upgradedRuntime), { initialUrl: '/' });
    expect(await screen.findByText('privacy-consent-screen')).toBeTruthy();
    expect(router.getPathname()).toBe('/privacy-consent');

    await act(async () => {
      upgradedRuntime.privacyGateStore.getState().acceptPrivacyPolicy();
    });

    expect(await screen.findByText('home-index-screen')).toBeTruthy();
  });

  it('closing a webview opened as the first screen falls back to the guarded login root instead of an unhandled GO_BACK', async () => {
    const user = userEvent.setup();
    const runtime = createFreshInstallRuntime();

    const router = await renderRouter(createRouteTree(runtime, WebViewRoute), {
      initialUrl: '/webview',
    });

    expect(await screen.findByText('已拦截非受信任域名链接')).toBeTruthy();

    await user.press(screen.getByText('关闭'));

    expect(await screen.findByText('login-screen')).toBeTruthy();
    expect(router.getPathname()).toBe('/login');
  });
});

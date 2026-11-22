import React from 'react';
import { Text } from 'react-native';
import { userEvent } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { GuardedRootStack } from '@/app/_layout';
import WebViewRoute from '@/app/webview';
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
    '(auth)/login': () => <Text>login-screen</Text>,
    '(tabs)/_layout': () => <Stack screenOptions={{ headerShown: false }} />,
    '(tabs)/index': () => <Text>tabs-home-screen</Text>,
    'feed/[id]': () => <Text>feed-detail-screen</Text>,
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

  it('redirects an authenticated user with unaccepted privacy policy to privacy-consent before entering tabs', async () => {
    const runtime = createFreshInstallRuntime();
    await runtime.authSessionStore.getState().establishSession({
      tokens: { accessToken: 'tok', refreshToken: 'ref' },
      user: { id: 'u1', username: 'admin', displayName: 'Admin' },
    });

    const router = await renderRouter(createRouteTree(runtime), { initialUrl: '/' });
    expect(await screen.findByText('privacy-consent-screen')).toBeTruthy();
    expect(router.getPathname()).toBe('/privacy-consent');

    await act(async () => {
      runtime.privacyGateStore.getState().acceptPrivacyPolicy();
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

import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { appIdentity } from '@root/app.identity';
import { AuthHydrationGate } from '@/core/auth/AuthHydrationGate';
import { appPerformanceMarks } from '@/core/observability/performance-marks';
import {
  AppRuntimeProvider,
  createAppRuntime,
  resolveStartupRuntimeEnv,
  useAppRuntime,
  useAuthSession,
  usePrivacyGate,
} from '@/core/runtime';
import { AppDrawerShell, WelcomeOverlayGate } from '@/features/shell';
import { appTranslationResources, createMockHttpTransport } from '@/shared';

// 原因：Route Shell 仅声明路由树与守卫布尔条件，零状态副作用编排且零具体界面元素
export function GuardedRootStack(): React.JSX.Element {
  const { privacyGateStore, authSessionStore } = useAppRuntime();
  const isPrivacyReady = usePrivacyGate((state) => state.phase === 'ready');
  const authStatus = useAuthSession((state) => state.status);
  // 原因：首次启动先经欢迎引导页落到登录页，由登录页勾选同意隐私协议；若老用户已登录但隐私协议升版，仍强制拦截到协议页重签
  const guardFallback =
    authStatus === 'authenticated' ? (isPrivacyReady ? '/' : '/privacy-consent') : '/login';

  return (
    <AuthHydrationGate privacyGateStore={privacyGateStore} authSessionStore={authSessionStore}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="webview" />
        <Stack.Protected
          guard={!isPrivacyReady || authStatus !== 'authenticated'}
          redirectTo={guardFallback}
        >
          <Stack.Screen name="privacy-consent" />
        </Stack.Protected>
        <Stack.Screen name="register" />
        <Stack.Protected guard={authStatus !== 'authenticated'} redirectTo={guardFallback}>
          <Stack.Screen name="(auth)/login" />
        </Stack.Protected>
        <Stack.Protected
          guard={isPrivacyReady && authStatus === 'authenticated'}
          redirectTo={guardFallback}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="feed/[id]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="developer-lab" />
          <Stack.Screen name="list" />
          <Stack.Screen name="detail" />
          <Stack.Screen name="search" />
          <Stack.Screen name="form" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="status" />
          <Stack.Screen name="index" />
        </Stack.Protected>
      </Stack>
    </AuthHydrationGate>
  );
}

// 原因：只在根布局记录标记——根布局首次挂载是「首屏」的近似点（早于登录态恢复与隐私门禁，并非真正可交互）；
// 路由标记用路由模式（如 feed/[id]）而不是具体路径，避免把记录 ID 写进标记名、标记数量也有上限；同名标记只记首次
function PerformanceMarkers(): null {
  const segments = useSegments();
  const routePattern = segments.join('/');

  useEffect(() => {
    appPerformanceMarks.mark('root-mounted');
  }, []);

  useEffect(() => {
    appPerformanceMarks.mark(`route:/${routePattern}`);
  }, [routePattern]);

  return null;
}

// 原因：抽屉盖在整个路由树之上，边缘拖出只在底部导航根页面开启，栈页面最左边缘留给「左滑返回」
function RootDrawerBridge(): React.JSX.Element {
  const segments = useSegments();
  const router = useRouter();

  return (
    <AppDrawerShell
      edgeSwipeEnabled={segments[0] === '(tabs)'}
      onNavigateRoute={(route) => router.push(route)}
    />
  );
}

export default function RootLayout(): React.JSX.Element {
  const runtime = useMemo(() => {
    const env = resolveStartupRuntimeEnv();
    const useMockGateway = Boolean(env.enableMockGateway) && env.appVariant !== 'production';
    return createAppRuntime({
      identity: appIdentity,
      env,
      translations: appTranslationResources,
      overrides: useMockGateway ? { httpTransport: createMockHttpTransport() } : undefined,
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppRuntimeProvider runtime={runtime}>
        <PerformanceMarkers />
        <GuardedRootStack />
        <RootDrawerBridge />
        <WelcomeOverlayGate />
      </AppRuntimeProvider>
    </GestureHandlerRootView>
  );
}

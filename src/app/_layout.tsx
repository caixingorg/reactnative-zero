import { Stack, useSegments } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { appIdentity } from '@root/app.identity';
import { AuthHydrationGate } from '@/core/auth/AuthHydrationGate';
import { appPerformanceMarks } from '@/core/observability/performance-marks';
import {
  AppRuntimeProvider,
  createAppRuntime,
  resolveStartupRuntimeEnv,
  useAuthSession,
  usePrivacyGate,
  useAppRuntime,
} from '@/core/runtime';
import { appTranslationResources, createDemoHttpTransport } from '@/shared';

// 原因：Route Shell 仅声明路由树与守卫布尔条件，零状态副作用编排且零具体界面元素
export function GuardedRootStack(): React.JSX.Element {
  const { privacyGateStore, authSessionStore } = useAppRuntime();
  const isPrivacyReady = usePrivacyGate((state) => state.phase === 'ready');
  const authStatus = useAuthSession((state) => state.status);
  // 原因：被守卫拦截时必须显式指定回退目标。expo-router 的默认回退按文件系统排序（同级按路由名长度）
  // 挑选首个未受保护路由，会落到未受保护的 webview（空 URL）而绕过隐私同意页
  const guardFallback = !isPrivacyReady
    ? '/privacy-consent'
    : authStatus === 'authenticated'
      ? '/'
      : '/login';

  return (
    <AuthHydrationGate privacyGateStore={privacyGateStore} authSessionStore={authSessionStore}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="webview" />
        <Stack.Protected guard={!isPrivacyReady} redirectTo={guardFallback}>
          <Stack.Screen name="privacy-consent" />
        </Stack.Protected>
        <Stack.Protected
          guard={isPrivacyReady && authStatus === 'unauthenticated'}
          redirectTo={guardFallback}
        >
          <Stack.Screen name="(auth)/login" />
        </Stack.Protected>
        <Stack.Protected
          guard={isPrivacyReady && authStatus === 'authenticated'}
          redirectTo={guardFallback}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="feed/[id]" />
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

export default function RootLayout(): React.JSX.Element {
  const runtime = useMemo(() => {
    const env = resolveStartupRuntimeEnv();
    const useDemoGateway = Boolean(env.enableDemoGateway) && env.appVariant !== 'production';
    return createAppRuntime({
      identity: appIdentity,
      env,
      translations: appTranslationResources,
      overrides: useDemoGateway ? { httpTransport: createDemoHttpTransport() } : undefined,
    });
  }, []);

  return (
    <AppRuntimeProvider runtime={runtime}>
      <PerformanceMarkers />
      <GuardedRootStack />
    </AppRuntimeProvider>
  );
}

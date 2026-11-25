import Constants from 'expo-constants';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { appIdentity } from '@root/app.identity';
import { AuthHydrationGate } from '@/core/auth/AuthHydrationGate';
import {
  sanitizeNotificationRoute,
  useNotificationsCapability,
} from '@/core/capabilities/notifications';
import type { RuntimePublicEnv } from '@/core/config/types';
import type { ErrorReporter } from '@/core/observability/observability';
import { appPerformanceMarks } from '@/core/observability/performance-marks';
import {
  AppRuntimeProvider,
  createAppRuntime,
  resolveStartupRuntimeEnv,
  useAppRuntime,
  useAuthSession,
  usePrivacyGate,
} from '@/core/runtime';
import {
  createSentryErrorReporter,
  type SentryClientLike,
} from '@/core/vendors/sentry-error-reporter';
import { AppDrawerShell, BiometricLockOverlayGate, WelcomeOverlayGate } from '@/features/shell';
import { appTranslationResources, createMockHttpTransport } from '@/shared';

// 原因：遵循 ADR-0006（Proposed），底座不预装 @sentry/react-native；仅在配置了 DSN 且派生应用注入客户端时装配 ErrorReporter，初始化仍由 Privacy Gate 二阶段控制
export function resolveRootErrorReporter(
  env: RuntimePublicEnv,
  client?: SentryClientLike,
): ErrorReporter | undefined {
  if (!client || !env.sentryDsn) {
    return undefined;
  }
  const appVersion = Constants.expoConfig?.version;
  return createSentryErrorReporter({
    client,
    dsn: env.sentryDsn,
    environment: env.appVariant,
    release: appVersion ? `${appIdentity.slug}@${appVersion}` : undefined,
  });
}

// 原因：Route Shell 仅声明路由树与守卫布尔条件，零状态副作用编排且零具体界面元素
export function GuardedRootStack(): React.JSX.Element {
  const { privacyGateStore, authSessionStore, env } = useAppRuntime();
  const isPrivacyReady = usePrivacyGate((state) => state.phase === 'ready');
  const authStatus = useAuthSession((state) => state.status);
  const isProduction = env.appVariant === 'production';
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
          <Stack.Screen name="list" />
          <Stack.Screen name="detail" />
          <Stack.Screen name="search" />
          <Stack.Screen name="form" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="status" />
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected
          guard={isPrivacyReady && authStatus === 'authenticated' && !isProduction}
          redirectTo={guardFallback}
        >
          <Stack.Screen name="developer-lab" />
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

// 原因：监听前台与冷启通知点击并严格校验站内路由白名单；若点击时隐私协议未同意或尚未登录，先暂存待跳转路径，待双门禁就绪后自动消费一次
export function NotificationNavigationBridge(): null {
  const { env, privacyGateStore, authSessionStore } = useAppRuntime();
  const notifications = useNotificationsCapability();
  const isPrivacyReady = usePrivacyGate((state) => state.phase === 'ready');
  const authStatus = useAuthSession((state) => state.status);
  const router = useRouter();
  const pendingRouteRef = useRef<string | null>(null);
  const initialConsumedRef = useRef(false);

  useEffect(() => {
    if (!notifications.enabled) {
      return;
    }
    let active = true;

    const handleTargetRoute = (rawRoute: unknown): void => {
      const safeRoute = sanitizeNotificationRoute(rawRoute, { appVariant: env.appVariant });
      if (!safeRoute) {
        return;
      }
      const canNavigateNow =
        privacyGateStore.getState().phase === 'ready' &&
        authSessionStore.getState().status === 'authenticated';
      if (canNavigateNow) {
        pendingRouteRef.current = null;
        router.push(safeRoute as Href);
      } else {
        pendingRouteRef.current = safeRoute;
      }
    };

    const unsubscribe = notifications.subscribeNotificationResponses((payload) => {
      if (!active) {
        return;
      }
      handleTargetRoute(payload.route);
    });

    if (!initialConsumedRef.current) {
      initialConsumedRef.current = true;
      void notifications.getInitialNotificationResponse().then((initial) => {
        if (!active || !initial) {
          return;
        }
        handleTargetRoute(initial.route);
      });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authSessionStore, env.appVariant, notifications, privacyGateStore, router]);

  useEffect(() => {
    if (isPrivacyReady && authStatus === 'authenticated' && pendingRouteRef.current) {
      const nextRoute = pendingRouteRef.current;
      pendingRouteRef.current = null;
      router.push(nextRoute as Href);
    }
  }, [authStatus, isPrivacyReady, router]);

  return null;
}

export default function RootLayout(): React.JSX.Element {
  const runtime = useMemo(() => {
    const env = resolveStartupRuntimeEnv();
    const useMockGateway = Boolean(env.enableMockGateway) && env.appVariant !== 'production';
    const errorReporter = resolveRootErrorReporter(env);
    return createAppRuntime({
      identity: appIdentity,
      env,
      translations: appTranslationResources,
      observability: errorReporter ? { errorReporter } : undefined,
      overrides: useMockGateway ? { httpTransport: createMockHttpTransport() } : undefined,
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppRuntimeProvider runtime={runtime}>
        <PerformanceMarkers />
        <NotificationNavigationBridge />
        <GuardedRootStack />
        <RootDrawerBridge />
        <BiometricLockOverlayGate />
        <WelcomeOverlayGate />
      </AppRuntimeProvider>
    </GestureHandlerRootView>
  );
}

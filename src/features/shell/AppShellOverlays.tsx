/**
 * @module features/shell/AppShellOverlays
 * 职责：承接全局抽屉壳与首次欢迎引导门禁浮层，以及抽屉目标到路由参数的纯映射，保持 Route Shell (_layout.tsx) 精简纯粹。
 * 边界：不直接依赖 expo-router，所有跳转由 Route Shell 通过 onNavigate 回调注入。
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBiometricsCapability } from '@/core/capabilities/biometrics';
import { useAppRuntime, useAuthSession, usePreferences, useToast } from '@/core/runtime';
import { AppText, Button, DrawerHost, Screen, VStack } from '@/core/ui';
import { DrawerMenu, type DrawerNavTarget } from './DrawerMenu';
import { WelcomeScreen } from './WelcomeScreen';

export type DrawerRouteDescriptor =
  | '/settings'
  | '/(tabs)/profile'
  | '/form'
  | '/register'
  | '/checkout'
  | '/login'
  | { pathname: '/list'; params: { title: string } }
  | { pathname: '/status'; params: { kind: 'empty'; title: string } };

const DRAWER_ROUTE_MAP: Record<DrawerNavTarget, DrawerRouteDescriptor> = {
  settings: '/settings',
  profile: '/(tabs)/profile',
  favorites: { pathname: '/list', params: { title: '收藏' } },
  history: { pathname: '/list', params: { title: '历史' } },
  register: '/register',
  checkout: '/checkout',
  feedback: '/form',
  about: { pathname: '/status', params: { kind: 'empty', title: '关于' } },
  login: '/login',
};

export function resolveDrawerRoute(target: DrawerNavTarget): DrawerRouteDescriptor {
  return DRAWER_ROUTE_MAP[target];
}

export interface AppDrawerShellProps {
  edgeSwipeEnabled: boolean;
  onNavigateRoute: (route: DrawerRouteDescriptor) => void;
}

export function AppDrawerShell({
  edgeSwipeEnabled,
  onNavigateRoute,
}: AppDrawerShellProps): React.JSX.Element {
  const { drawerStore } = useAppRuntime();

  return (
    <DrawerHost drawerStore={drawerStore} edgeSwipeEnabled={edgeSwipeEnabled}>
      <DrawerMenu
        onClose={() => drawerStore.getState().close()}
        onNavigate={(target) => {
          onNavigateRoute(resolveDrawerRoute(target));
          return true;
        }}
      />
    </DrawerHost>
  );
}

export function WelcomeOverlayGate(): React.JSX.Element | null {
  const { preferencesStore } = useAppRuntime();
  const hasCompletedWelcome = usePreferences((state) => state.hasCompletedWelcome);

  // 原因：欢迎页为纯静态引导且不初始化任何三方 SDK，首次冷启优先展示欢迎页，完成后进入登录页勾选同意协议
  if (hasCompletedWelcome) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.welcomeOverlay]}>
      <WelcomeScreen onComplete={() => preferencesStore.getState().completeWelcome()} />
    </View>
  );
}

export function BiometricLockOverlayGate(): React.JSX.Element | null {
  const { authSessionStore, preferencesStore } = useAppRuntime();
  const authStatus = useAuthSession((state) => state.status);
  const biometricLockEnabled = usePreferences((state) => state.biometricLockEnabled);
  const biometrics = useBiometricsCapability();
  const toast = useToast();
  const [unlockedForSession, setUnlockedForSession] = useState(false);
  const [verifying, setVerifying] = useState(false);

  if (
    !biometrics.enabled ||
    !biometricLockEnabled ||
    authStatus !== 'authenticated' ||
    unlockedForSession
  ) {
    return null;
  }

  const handleUnlock = async (): Promise<void> => {
    setVerifying(true);
    try {
      const res = await biometrics.authenticate('请验证面容或指纹以解锁应用');
      if (res?.authenticated) {
        setUnlockedForSession(true);
      } else {
        toast.show({ message: '生物识别未通过，请重试', tone: 'warning' });
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View testID="biometric-lock-overlay" style={[StyleSheet.absoluteFill, styles.welcomeOverlay]}>
      <Screen>
        <VStack flex={1} justify="center" align="center" p="xl" gap="lg">
          <VStack align="center" gap="xs">
            <AppText variant="titleLg">应用已开启生物识别保护</AppText>
            <AppText variant="bodySm" tone="secondary" align="center">
              请验证您的面容或指纹以继续访问受保护内容
            </AppText>
          </VStack>
          <VStack gap="sm" style={styles.lockActions}>
            <Button
              testID="biometric-lock-unlock-btn"
              label="验证生物识别解锁"
              loading={verifying}
              onPress={() => {
                void handleUnlock();
              }}
            />
            <Button
              testID="biometric-lock-signout-btn"
              label="退出当前账号"
              variant="ghost"
              onPress={() => {
                preferencesStore.getState().setBiometricLockEnabled(false);
                void authSessionStore.getState().clearSession();
              }}
            />
          </VStack>
        </VStack>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  welcomeOverlay: {
    zIndex: 100,
  },
  lockActions: {
    width: '100%',
    maxWidth: 280,
  },
});

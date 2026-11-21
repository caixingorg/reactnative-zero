/**
 * @module features/shell/AppShellOverlays
 * 职责：承接全局抽屉壳与首次欢迎引导门禁浮层，以及抽屉目标到路由参数的纯映射，保持 Route Shell (_layout.tsx) 精简纯粹。
 * 边界：不直接依赖 expo-router，所有跳转由 Route Shell 通过 onNavigate 回调注入。
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppRuntime, usePreferences, usePrivacyGate } from '@/core/runtime';
import { DrawerHost } from '@/core/ui';
import { DrawerMenu, type DrawerNavTarget } from './DrawerMenu';
import { WelcomeScreen } from './WelcomeScreen';

export type DrawerRouteDescriptor =
  | '/settings'
  | '/(tabs)/profile'
  | '/form'
  | '/login'
  | { pathname: '/list'; params: { title: string } }
  | { pathname: '/status'; params: { kind: 'empty'; title: string } };

const DRAWER_ROUTE_MAP: Record<DrawerNavTarget, DrawerRouteDescriptor> = {
  settings: '/settings',
  profile: '/(tabs)/profile',
  favorites: { pathname: '/list', params: { title: '收藏' } },
  history: { pathname: '/list', params: { title: '历史' } },
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
  const isPrivacyReady = usePrivacyGate((state) => state.phase === 'ready');
  const hasCompletedWelcome = usePreferences((state) => state.hasCompletedWelcome);

  if (!isPrivacyReady || hasCompletedWelcome) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.welcomeOverlay]}>
      <WelcomeScreen onComplete={() => preferencesStore.getState().completeWelcome()} />
    </View>
  );
}

const styles = StyleSheet.create({
  welcomeOverlay: {
    zIndex: 100,
  },
});

import React, { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useStore } from 'zustand';
import type { PrivacyGateStore } from '../bootstrap/privacy-gate-store';
import { useAppTheme } from '../theme/theme-context';
import { Screen, VStack } from '../ui';
import type { AuthSessionStore } from './auth-session-store';

export interface AuthHydrationGateProps {
  privacyGateStore: PrivacyGateStore;
  authSessionStore: AuthSessionStore;
  children: React.ReactNode;
}

// 原因：将会话冷启动恢复生命周期与加载占位收敛在内核边界，保持 Route Shell 零状态编排与零 UI 细节
export function AuthHydrationGate({
  privacyGateStore,
  authSessionStore,
  children,
}: AuthHydrationGateProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const isPrivacyReady = useStore(privacyGateStore, (state) => state.phase === 'ready');
  const authStatus = useStore(authSessionStore, (state) => state.status);

  useEffect(() => {
    if (isPrivacyReady && authStatus === 'hydrating') {
      void authSessionStore.getState().hydrateSession();
    }
  }, [authSessionStore, authStatus, isPrivacyReady]);

  if (isPrivacyReady && authStatus === 'hydrating') {
    return (
      <Screen>
        <VStack flex={1} align="center" justify="center">
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        </VStack>
      </Screen>
    );
  }

  return <>{children}</>;
}

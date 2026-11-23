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

// 原因：本地会话水合仅读取本机 Keychain/Keystore 与 createAppRuntime 启动瞬间已采样的沙盒标记，不触发任何第三方 SDK 或设备标识采集；
// 必须在路由守卫重定向前完成水合，确保老用户覆盖升级且隐私协议升版时能被准确识别为 authenticated 并路由至 /privacy-consent 重签页
export function AuthHydrationGate({
  authSessionStore,
  children,
}: AuthHydrationGateProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const authStatus = useStore(authSessionStore, (state) => state.status);

  useEffect(() => {
    if (authStatus === 'hydrating') {
      void authSessionStore.getState().hydrateSession();
    }
  }, [authSessionStore, authStatus]);

  if (authStatus === 'hydrating') {
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

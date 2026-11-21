import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import type { PrivacyGateStore } from '../bootstrap/privacy-gate-store';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from '../ui';
import type { ConnectivityStore } from './network-monitor';

export interface OfflineBannerProps {
  connectivityStore: ConnectivityStore;
  privacyGateStore: PrivacyGateStore;
}

// 原因：仅在二阶段隐私同意后启动监听，并采用绝对定位悬浮胶囊呈现，消除页面整体下推抖动与双重顶部安全区内边距
export function OfflineBanner({
  connectivityStore,
  privacyGateStore,
}: OfflineBannerProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const phase = useStore(privacyGateStore, (state) => state.phase);
  const isOnline = useStore(connectivityStore, (state) => state.isOnline);
  const startMonitoring = useStore(connectivityStore, (state) => state.startMonitoring);

  useEffect(() => {
    if (phase !== 'ready') {
      return;
    }
    return startMonitoring();
  }, [phase, startMonitoring]);

  if (phase !== 'ready' || isOnline) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.floatingBanner,
        {
          top: Math.max(insets.top, tokens.spacing.sm),
          left: tokens.spacing.md,
          right: tokens.spacing.md,
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.sm,
          borderRadius: tokens.radii.md,
          backgroundColor: tokens.colors.warning,
        },
      ]}
    >
      <AppText variant="caption" tone="onPrimary" weight="600" align="center">
        {t('common.offlineBanner')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingBanner: {
    position: 'absolute',
    zIndex: 1000,
    alignItems: 'center',
  },
});

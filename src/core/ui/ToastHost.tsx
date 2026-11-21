import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import type { ToastStore, ToastTone } from './toast-store';

export interface ToastHostProps {
  toastStore: ToastStore;
}

// 原因：挂载在 AppRuntimeProvider 顶层的单一轻提示宿主，自动避让顶部安全区并在卸载或替换时清理定时器，避免泄漏
export function ToastHost({ toastStore }: ToastHostProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const activeToast = useStore(toastStore, (state) => state.activeToast);
  const dismiss = useStore(toastStore, (state) => state.dismiss);

  useEffect(() => {
    if (!activeToast || activeToast.durationMs <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      dismiss(activeToast.id);
    }, activeToast.durationMs);
    return () => {
      clearTimeout(timer);
    };
  }, [activeToast, dismiss]);

  if (!activeToast) {
    return null;
  }

  const accentByTone: Record<ToastTone, string> = {
    info: tokens.colors.primary,
    success: tokens.colors.success,
    warning: tokens.colors.warning,
    danger: tokens.colors.danger,
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          top: insets.top + tokens.spacing.md,
          paddingHorizontal: tokens.spacing.lg,
        },
      ]}
    >
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={t('common.close')}
        onPress={() => dismiss(activeToast.id)}
        style={[
          styles.toast,
          {
            backgroundColor: tokens.colors.surface,
            borderColor: tokens.colors.border,
            borderLeftColor: accentByTone[activeToast.tone],
            borderRadius: tokens.radii.md,
            paddingHorizontal: tokens.spacing.md,
            paddingVertical: tokens.spacing.sm + 2,
          },
        ]}
      >
        <AppText variant="bodySm" weight="600" style={styles.message}>
          {activeToast.message}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 999,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderLeftWidth: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  message: {
    flexShrink: 1,
  },
});

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useBiometricsCapability } from '@/core/capabilities/biometrics';
import type { LegalDocumentTarget } from '@/core/config/types';
import type { SupportedLanguage } from '@/core/i18n/resources';
import {
  useAppRuntime,
  useAuthSession,
  useDevTools,
  usePreferences,
  useToast,
} from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import type { ThemePreference } from '@/core/theme/tokens';
import {
  AppHeader,
  AppText,
  ConfirmDialog,
  HStack,
  Screen,
  SettingsList,
  VStack,
  type SettingsListItem,
  type SettingsSection,
} from '@/core/ui';

export interface SettingsScreenProps {
  onBack?: () => void;
  onOpenLegalDocument?: (doc: LegalDocumentTarget) => void;
  onOpenDevTools?: () => void;
  onOpenDeveloperLab?: () => void;
  onReplayWelcome?: () => void;
}

export function SettingsScreen({
  onBack,
  onOpenLegalDocument,
  onOpenDevTools,
  onOpenDeveloperLab,
  onReplayWelcome,
}: SettingsScreenProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { identity, env, authSessionStore, devToolsStore } = useAppRuntime();
  const { tokens, themePreference, setThemePreference } = useAppTheme();
  const authStatus = useAuthSession((state) => state.status);
  const user = useAuthSession((state) => state.user);
  const effectiveApiBaseUrl = useDevTools((state) => state.effectiveApiBaseUrl);
  const language = usePreferences((state) => state.language);
  const setLanguage = usePreferences((state) => state.setLanguage);
  const biometrics = useBiometricsCapability();
  const toast = useToast();
  const [biometricLockEnabled, setBiometricLockEnabled] = useState(false);
  const [signOutDialogVisible, setSignOutDialogVisible] = useState(false);

  const openDevToolsHandler =
    env.appVariant !== 'production' && devToolsStore.getState().enabled
      ? (onOpenDevTools ?? (() => devToolsStore.getState().openDrawer()))
      : undefined;

  const handleToggleBiometricLock = async (nextValue: boolean): Promise<void> => {
    if (!nextValue) {
      setBiometricLockEnabled(false);
      return;
    }
    const result = await biometrics.authenticate('验证生物识别以开启应用安全锁');
    if (result?.authenticated) {
      setBiometricLockEnabled(true);
      toast.show({ message: '已开启生物识别安全锁', tone: 'success' });
    } else {
      toast.show({ message: '生物识别校验未通过', tone: 'warning' });
    }
  };

  const themeOptions: readonly { key: ThemePreference; label: string }[] = [
    { key: 'system', label: t('settings.appearanceSystem') },
    { key: 'light', label: t('settings.appearanceLight') },
    { key: 'dark', label: t('settings.appearanceDark') },
  ];

  const languageOptions: readonly { key: SupportedLanguage; label: string }[] = [
    { key: 'zh-CN', label: t('settings.languageZh') },
    { key: 'en-US', label: t('settings.languageEn') },
  ];

  const securityItems: SettingsListItem[] = [];
  if (biometrics.enabled) {
    securityItems.push({
      key: 'biometric-lock',
      kind: 'switch',
      label: '生物识别解锁',
      description: '使用面容或指纹保护应用访问',
      icon: 'shield-checkmark-outline',
      iconColor: '#16A34A',
      iconBg: tokens.isDark ? 'rgba(34,197,94,0.18)' : '#DCFCE7',
      value: biometricLockEnabled,
      onValueChange: (next) => {
        void handleToggleBiometricLock(next);
      },
      testID: 'settings-biometrics-switch',
    });
  }

  if (onOpenLegalDocument) {
    securityItems.push(
      {
        key: 'privacy',
        kind: 'link',
        label: t('settings.privacyPolicyLink'),
        icon: 'document-text-outline',
        iconColor: '#D97706',
        iconBg: tokens.isDark ? 'rgba(245,158,11,0.18)' : '#FEF3C7',
        onPress: () =>
          onOpenLegalDocument({
            url: env.privacyPolicyUrl,
            title: t('settings.privacyPolicyLink'),
          }),
      },
      {
        key: 'agreement',
        kind: 'link',
        label: t('settings.userAgreementLink'),
        icon: 'reader-outline',
        iconColor: '#EA580C',
        iconBg: tokens.isDark ? 'rgba(234,88,12,0.18)' : '#FFEDD5',
        onPress: () =>
          onOpenLegalDocument({
            url: env.userAgreementUrl,
            title: t('settings.userAgreementLink'),
          }),
      },
    );
  }

  if (onReplayWelcome) {
    securityItems.push({
      key: 'welcome',
      kind: 'link',
      label: '重看欢迎引导',
      icon: 'sparkles-outline',
      iconColor: '#7C3AED',
      iconBg: tokens.isDark ? 'rgba(139,92,246,0.18)' : '#EDE9FE',
      onPress: onReplayWelcome,
      testID: 'settings-replay-welcome-btn',
    });
  }

  const developerItems: SettingsListItem[] = [];
  if (onOpenDeveloperLab) {
    developerItems.push({
      key: 'developer-lab',
      kind: 'link',
      label: t('settings.developerLabButton'),
      icon: 'flask-outline',
      iconColor: '#7C3AED',
      iconBg: tokens.isDark ? 'rgba(139,92,246,0.18)' : '#EDE9FE',
      onPress: onOpenDeveloperLab,
      testID: 'settings-developer-lab-btn',
    });
  }
  if (openDevToolsHandler) {
    developerItems.push({
      key: 'devtools',
      kind: 'link',
      label: t('settings.openDevToolsButton'),
      icon: 'code-slash-outline',
      iconColor: '#475569',
      iconBg: tokens.isDark ? 'rgba(148,163,184,0.18)' : '#F1F5F9',
      onPress: openDevToolsHandler,
    });
  }

  const appInfoItems: SettingsListItem[] = [
    {
      key: 'name',
      kind: 'info',
      label: '应用名称',
      value: identity.displayName,
      icon: 'apps-outline',
      iconColor: tokens.colors.primary,
      iconBg: tokens.colors.primarySoft,
    },
    {
      key: 'variant',
      kind: 'info',
      label: t('settings.variantLabel'),
      value: env.appVariant.toUpperCase(),
      icon: 'layers-outline',
      iconColor: '#0284C7',
      iconBg: tokens.isDark ? 'rgba(14,165,233,0.18)' : '#E0F2FE',
    },
    {
      key: 'api',
      kind: 'info',
      label: '接口地址',
      value: effectiveApiBaseUrl,
      icon: 'server-outline',
      iconColor: '#64748B',
      iconBg: tokens.isDark ? 'rgba(148,163,184,0.18)' : '#F1F5F9',
    },
  ];

  const sections: SettingsSection[] = [];
  if (securityItems.length > 0) {
    sections.push({ key: 'security', title: '安全与隐私', items: securityItems });
  }
  if (developerItems.length > 0) {
    sections.push({ key: 'developer', title: '开发者', items: developerItems });
  }
  sections.push({ key: 'app-info', title: t('settings.appInfoTitle'), items: appInfoItems });

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      {onBack ? (
        <AppHeader title={t('settings.title')} showBack onBack={onBack} />
      ) : (
        <AppHeader title={t('settings.title')} />
      )}

      <Screen scrollable edges={[]}>
        <VStack gap="lg">
          {/* Top Account Profile Card */}
          <HStack
            p="md"
            gap="md"
            align="center"
            style={[
              styles.profileCard,
              {
                backgroundColor: tokens.colors.surface,
                borderRadius: tokens.radii.lg,
              },
            ]}
          >
            <View
              style={[
                styles.avatar,
                { backgroundColor: tokens.colors.primary, borderRadius: tokens.radii.full },
              ]}
            >
              <AppText variant="titleMd" tone="inverse" weight="700">
                {(user?.displayName ?? '访').slice(0, 1).toUpperCase()}
              </AppText>
            </View>
            <VStack flex={1} gap="xs">
              <AppText variant="titleMd">{user?.displayName ?? '访客账号'}</AppText>
              <AppText variant="caption" tone="secondary">
                {authStatus === 'authenticated' ? '已登录 · 数字生活专业版' : '未登录'}
              </AppText>
            </VStack>
            <Ionicons name="chevron-forward" size={16} color={tokens.colors.textSecondary} />
          </HStack>

          {/* Display & Language Grouped Card */}
          <VStack gap="xs">
            <AppText variant="caption" tone="secondary" style={styles.sectionLabel}>
              显示与语言
            </AppText>
            <View
              style={[
                styles.groupCard,
                { backgroundColor: tokens.colors.surface, borderRadius: tokens.radii.lg },
              ]}
            >
              <HStack style={styles.inlineRow} align="center" justify="space-between" gap="sm">
                <AppText variant="bodyMd" weight="500">
                  {t('settings.appearanceTitle')}
                </AppText>
                <HStack
                  p="xs"
                  gap="xs"
                  style={[
                    styles.inlinePillTrack,
                    { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
                  ]}
                >
                  {themeOptions.map((option) => {
                    const active = themePreference === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setThemePreference(option.key)}
                        style={[
                          styles.inlinePillItem,
                          { borderRadius: tokens.radii.sm },
                          active && { backgroundColor: tokens.colors.surface },
                        ]}
                      >
                        <AppText
                          variant="caption"
                          tone={active ? 'primary' : 'secondary'}
                          weight={active ? '600' : '400'}
                        >
                          {option.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </HStack>
              </HStack>

              <View style={[styles.insetDivider, { backgroundColor: tokens.colors.border }]} />

              <HStack style={styles.inlineRow} align="center" justify="space-between" gap="sm">
                <HStack align="center" gap="md">
                  <View
                    style={[
                      styles.iconBadge,
                      {
                        backgroundColor: tokens.isDark ? 'rgba(56,189,248,0.18)' : '#E0F2FE',
                        borderRadius: tokens.radii.sm,
                      },
                    ]}
                  >
                    <Ionicons name="language-outline" size={16} color="#0284C7" />
                  </View>
                  <AppText variant="bodyMd" weight="500">
                    {t('settings.languageTitle')}
                  </AppText>
                </HStack>
                <HStack
                  p="xs"
                  gap="xs"
                  style={[
                    styles.inlinePillTrack,
                    { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
                  ]}
                >
                  {languageOptions.map((option) => {
                    const active = language === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setLanguage(option.key)}
                        style={[
                          styles.inlinePillItem,
                          { borderRadius: tokens.radii.sm },
                          active && { backgroundColor: tokens.colors.surface },
                        ]}
                      >
                        <AppText
                          variant="caption"
                          tone={active ? 'primary' : 'secondary'}
                          weight={active ? '600' : '400'}
                        >
                          {option.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </HStack>
              </HStack>
            </View>
          </VStack>

          <SettingsList sections={sections} />

          {authStatus === 'authenticated' ? (
            <View
              style={[
                styles.signOutCard,
                {
                  backgroundColor: tokens.colors.surface,
                  borderRadius: tokens.radii.lg,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings.signOutButton')}
                onPress={() => setSignOutDialogVisible(true)}
                style={({ pressed }) => [
                  styles.signOutRow,
                  pressed && { backgroundColor: tokens.colors.surfaceMuted },
                ]}
              >
                <AppText variant="bodyMd" tone="brand" weight="600" align="center">
                  {t('settings.signOutButton')}
                </AppText>
              </Pressable>
            </View>
          ) : null}
        </VStack>

        <ConfirmDialog
          visible={signOutDialogVisible}
          title={t('settings.signOutConfirmTitle')}
          description={t('settings.signOutConfirmDescription')}
          confirmLabel={t('settings.signOutButton')}
          destructive
          onCancel={() => setSignOutDialogVisible(false)}
          onConfirm={() => {
            setSignOutDialogVisible(false);
            void authSessionStore.getState().clearSession();
          }}
        />
      </Screen>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    width: '100%',
  },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    paddingHorizontal: 8,
  },
  groupCard: {
    overflow: 'hidden',
  },
  inlineRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inlinePillTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlinePillItem: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  iconBadge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insetDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  signOutCard: {
    overflow: 'hidden',
  },
  signOutRow: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

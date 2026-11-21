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

interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

interface SegmentedControlCardProps<T extends string> {
  title: string;
  selectedKey: T;
  options: readonly SegmentOption<T>[];
  onSelect: (key: T) => void;
}

function SegmentedControlCard<T extends string>({
  title,
  selectedKey,
  options,
  onSelect,
}: SegmentedControlCardProps<T>): React.JSX.Element {
  const { tokens } = useAppTheme();

  return (
    <VStack gap="xs">
      <AppText variant="caption" tone="secondary" style={styles.sectionLabel}>
        {title}
      </AppText>
      <HStack
        p="xs"
        gap="xs"
        style={[
          styles.segmentTrack,
          {
            backgroundColor: tokens.colors.surfaceMuted,
            borderRadius: tokens.radii.lg,
          },
        ]}
      >
        {options.map((option) => {
          const active = selectedKey === option.key;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(option.key)}
              style={[
                styles.segmentItem,
                { borderRadius: tokens.radii.md },
                active && {
                  backgroundColor: tokens.colors.surface,
                  borderColor: tokens.colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <AppText
                variant="bodySm"
                tone={active ? 'primary' : 'secondary'}
                weight={active ? '600' : '400'}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </HStack>
    </VStack>
  );
}

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
  const effectiveApiBaseUrl = useDevTools((state) => state.effectiveApiBaseUrl);
  const language = usePreferences((state) => state.language);
  const setLanguage = usePreferences((state) => state.setLanguage);
  const biometrics = useBiometricsCapability();
  const toast = useToast();
  const [biometricLockEnabled, setBiometricLockEnabled] = useState(false);
  const [signOutDialogVisible, setSignOutDialogVisible] = useState(false);

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

  const openDevToolsHandler =
    env.appVariant !== 'production' && devToolsStore.getState().enabled
      ? (onOpenDevTools ?? (() => devToolsStore.getState().openDrawer()))
      : undefined;

  const themeOptions: readonly SegmentOption<ThemePreference>[] = [
    { key: 'system', label: t('settings.appearanceSystem') },
    { key: 'light', label: t('settings.appearanceLight') },
    { key: 'dark', label: t('settings.appearanceDark') },
  ];

  const languageOptions: readonly SegmentOption<SupportedLanguage>[] = [
    { key: 'zh-CN', label: t('settings.languageZh') },
    { key: 'en-US', label: t('settings.languageEn') },
  ];

  const appInfoItems: SettingsListItem[] = [
    { key: 'name', kind: 'info', label: '应用名称', value: identity.displayName },
    {
      key: 'variant',
      kind: 'info',
      label: t('settings.variantLabel'),
      value: env.appVariant.toUpperCase(),
    },
    { key: 'api', kind: 'info', label: '接口地址', value: effectiveApiBaseUrl },
  ];

  if (onOpenLegalDocument) {
    appInfoItems.push(
      {
        key: 'privacy',
        kind: 'link',
        label: t('settings.privacyPolicyLink'),
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
        onPress: () =>
          onOpenLegalDocument({
            url: env.userAgreementUrl,
            title: t('settings.userAgreementLink'),
          }),
      },
    );
  }

  if (onReplayWelcome) {
    appInfoItems.push({
      key: 'welcome',
      kind: 'link',
      label: '重看欢迎引导',
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
      onPress: onOpenDeveloperLab,
      testID: 'settings-developer-lab-btn',
    });
  }
  if (openDevToolsHandler) {
    developerItems.push({
      key: 'devtools',
      kind: 'link',
      label: t('settings.openDevToolsButton'),
      onPress: openDevToolsHandler,
    });
  }

  const sections: SettingsSection[] = [];

  if (biometrics.enabled) {
    sections.push({
      key: 'security',
      title: '安全与隐私',
      items: [
        {
          key: 'biometric-lock',
          kind: 'switch',
          label: '生物识别解锁',
          description: '使用面容或指纹保护应用访问',
          value: biometricLockEnabled,
          onValueChange: (next) => {
            void handleToggleBiometricLock(next);
          },
          testID: 'settings-biometrics-switch',
        },
      ],
    });
  }

  sections.push({ key: 'app-info', title: t('settings.appInfoTitle'), items: appInfoItems });

  if (developerItems.length > 0) {
    sections.push({ key: 'developer', title: '开发者', items: developerItems });
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      {onBack ? (
        <AppHeader title={t('settings.title')} showBack onBack={onBack} />
      ) : (
        <AppHeader title={t('settings.title')} />
      )}

      <Screen scrollable edges={[]}>
        <VStack gap="lg">
          <SegmentedControlCard
            title={t('settings.appearanceTitle')}
            selectedKey={themePreference}
            options={themeOptions}
            onSelect={setThemePreference}
          />

          <SegmentedControlCard
            title={t('settings.languageTitle')}
            selectedKey={language}
            options={languageOptions}
            onSelect={setLanguage}
          />

          <SettingsList sections={sections} />

          {authStatus === 'authenticated' ? (
            <View
              style={[
                styles.signOutCard,
                {
                  backgroundColor: tokens.colors.surface,
                  borderColor: tokens.colors.border,
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
                <AppText variant="bodyMd" tone="danger" weight="600" align="center">
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
  sectionLabel: {
    paddingHorizontal: 4,
  },
  segmentTrack: {
    width: '100%',
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutCard: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  signOutRow: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

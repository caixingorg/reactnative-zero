import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LegalDocumentTarget } from '@/core/config/types';
import type { SupportedLanguage } from '@/core/i18n/resources';
import { useAuthSession, usePreferences, useAppRuntime } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import type { ThemePreference } from '@/core/theme/tokens';
import { AppHeader, AppText, Box, Button, ConfirmDialog, HStack, Screen, VStack } from '@/core/ui';

interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

interface PreferenceSegmentCardProps<T extends string> {
  title: string;
  selectedKey: T;
  options: SegmentOption<T>[];
  onSelect: (key: T) => void;
}

function PreferenceSegmentCard<T extends string>({
  title,
  selectedKey,
  options,
  onSelect,
}: PreferenceSegmentCardProps<T>): React.JSX.Element {
  return (
    <VStack p="lg" gap="md" bg="surface" radius="lg" bordered>
      <AppText variant="titleMd">{title}</AppText>
      <HStack gap="sm">
        {options.map((option) => (
          <Box key={option.key} flex={1}>
            <Button
              label={option.label}
              variant={selectedKey === option.key ? 'primary' : 'outline'}
              onPress={() => onSelect(option.key)}
            />
          </Box>
        ))}
      </HStack>
    </VStack>
  );
}

export interface SettingsScreenProps {
  onBack?: () => void;
  onOpenLegalDocument?: (doc: LegalDocumentTarget) => void;
  onOpenDevTools?: () => void;
  onOpenDeveloperLab?: () => void;
}

export function SettingsScreen({
  onBack,
  onOpenLegalDocument,
  onOpenDevTools,
  onOpenDeveloperLab,
}: SettingsScreenProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { identity, env, authSessionStore, devToolsStore } = useAppRuntime();
  const authStatus = useAuthSession((state) => state.status);
  const { themePreference, setThemePreference } = useAppTheme();
  const language = usePreferences((state) => state.language);
  const setLanguage = usePreferences((state) => state.setLanguage);
  const [signOutDialogVisible, setSignOutDialogVisible] = useState(false);
  const openDevToolsHandler =
    env.appVariant !== 'production' && devToolsStore.getState().enabled
      ? (onOpenDevTools ?? (() => devToolsStore.getState().openDrawer()))
      : undefined;

  const themeOptions: SegmentOption<ThemePreference>[] = [
    { key: 'system', label: t('settings.appearanceSystem') },
    { key: 'light', label: t('settings.appearanceLight') },
    { key: 'dark', label: t('settings.appearanceDark') },
  ];

  const languageOptions: SegmentOption<SupportedLanguage>[] = [
    { key: 'zh-CN', label: t('settings.languageZh') },
    { key: 'en-US', label: t('settings.languageEn') },
  ];

  return (
    <Screen scrollable>
      {onBack ? (
        <AppHeader title={t('settings.title')} showBack onBack={onBack} />
      ) : (
        <AppText variant="titleLg">{t('settings.title')}</AppText>
      )}

      <PreferenceSegmentCard
        title={t('settings.appearanceTitle')}
        selectedKey={themePreference}
        options={themeOptions}
        onSelect={setThemePreference}
      />

      <PreferenceSegmentCard
        title={t('settings.languageTitle')}
        selectedKey={language}
        options={languageOptions}
        onSelect={setLanguage}
      />

      <VStack p="lg" gap="sm" bg="surface" radius="lg" bordered>
        <AppText variant="titleMd">{t('settings.appInfoTitle')}</AppText>
        <AppText variant="bodySm" tone="secondary">
          {identity.displayName} ({identity.slug})
        </AppText>
        <AppText variant="caption" tone="brand">
          {t('settings.variantLabel')}: {env.appVariant.toUpperCase()}
        </AppText>
        {onOpenLegalDocument ? (
          <HStack gap="sm">
            <Box flex={1}>
              <Button
                label={t('settings.privacyPolicyLink')}
                variant="outline"
                onPress={() =>
                  onOpenLegalDocument({
                    url: env.privacyPolicyUrl,
                    title: t('settings.privacyPolicyLink'),
                  })
                }
              />
            </Box>
            <Box flex={1}>
              <Button
                label={t('settings.userAgreementLink')}
                variant="outline"
                onPress={() =>
                  onOpenLegalDocument({
                    url: env.userAgreementUrl,
                    title: t('settings.userAgreementLink'),
                  })
                }
              />
            </Box>
          </HStack>
        ) : null}
        {onOpenDeveloperLab ? (
          <Button
            testID="settings-developer-lab-btn"
            label={t('settings.developerLabButton')}
            variant="outline"
            onPress={onOpenDeveloperLab}
          />
        ) : null}
        {openDevToolsHandler ? (
          <Button
            label={t('settings.openDevToolsButton')}
            variant="secondary"
            onPress={openDevToolsHandler}
          />
        ) : null}
      </VStack>

      {authStatus === 'authenticated' ? (
        <Button
          label={t('settings.signOutButton')}
          variant="danger"
          onPress={() => setSignOutDialogVisible(true)}
        />
      ) : null}

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
  );
}

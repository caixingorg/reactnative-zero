import Constants from 'expo-constants';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useStore } from 'zustand';
import type { AuthSessionStore } from '../auth/auth-session-store';
import type { RuntimePublicEnv } from '../config/types';
import type { ConnectivityStore } from '../network/network-monitor';
import type { Logger } from '../observability/observability';
import { appPerformanceMarks } from '../observability/performance-marks';
import { AppText, BottomSheetModal, Box, Button, HStack, TextField, VStack } from '../ui';
import type { DevToolsStore } from './devtools-store';

export interface DevToolsDrawerHostProps {
  env: RuntimePublicEnv;
  devToolsStore: DevToolsStore;
  authSessionStore: AuthSessionStore;
  connectivityStore: ConnectivityStore;
  logger: Logger;
}

function OpenDevToolsDrawerContent({
  env,
  devToolsStore,
  authSessionStore,
  connectivityStore,
  logger,
}: DevToolsDrawerHostProps): React.JSX.Element {
  const { t } = useTranslation();
  const effectiveApiBaseUrl = useStore(devToolsStore, (state) => state.effectiveApiBaseUrl);
  const authStatus = useStore(authSessionStore, (state) => state.status);
  const isOnline = useStore(connectivityStore, (state) => state.isOnline);

  const [draftUrlOverride, setDraftUrlOverride] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | undefined>(undefined);
  const [feedbackBanner, setFeedbackBanner] = useState<string | undefined>(undefined);
  const draftUrl = draftUrlOverride ?? effectiveApiBaseUrl;

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const recentLogs = [...logger.getRecentEntries()].slice(-15).reverse();

  const handleApplyUrl = (): void => {
    const result = devToolsStore.getState().applyApiBaseUrlOverride(draftUrl);
    if (!result.ok) {
      setUrlError(t('devtools.overrideInvalidError'));
      return;
    }
    setDraftUrlOverride(null);
    setUrlError(undefined);
    setFeedbackBanner(undefined);
  };

  const handleResetUrl = (): void => {
    devToolsStore.getState().resetApiBaseUrlOverride();
    setDraftUrlOverride(null);
    setUrlError(undefined);
    setFeedbackBanner(undefined);
  };

  const handleSimulateExpire = (): void => {
    void devToolsStore
      .getState()
      .simulateAccessTokenExpiration()
      .then(() => {
        setFeedbackBanner(t('devtools.actionFeedbackExpired'));
      });
  };

  const handleClearCaches = (): void => {
    devToolsStore.getState().clearLocalCaches();
    setDraftUrlOverride(null);
    setFeedbackBanner(t('devtools.actionFeedbackCleared'));
  };

  const handleResetPrivacy = (): void => {
    setFeedbackBanner(undefined);
    devToolsStore.getState().resetPrivacyGate();
  };

  return (
    <BottomSheetModal
      visible
      title={t('devtools.title')}
      onClose={() => devToolsStore.getState().closeDrawer()}
    >
      <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
        <VStack gap="md" py="xs">
          <VStack p="md" gap="xs" bg="surfaceMuted" radius="md" bordered>
            <AppText variant="bodySm" weight="600">
              {t('devtools.diagnosticsTitle')}
            </AppText>
            <AppText variant="caption" tone="brand" weight="600">
              {t('devtools.variantLabel')}: {env.appVariant.toUpperCase()} (
              {env.appChannel ?? 'official'})
            </AppText>
            <AppText variant="caption" tone="secondary">
              {t('devtools.versionLabel')}: v{appVersion} ({Platform.OS} {String(Platform.Version)})
            </AppText>
            <AppText variant="caption" tone="secondary">
              {t('devtools.startupLabel')}: {appPerformanceMarks.getMarks()['root-mounted'] ?? '—'}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {t('devtools.networkLabel')}:{' '}
              {isOnline ? t('devtools.networkOnline') : t('devtools.networkOffline')}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {t('devtools.credentialLabel')}:{' '}
              {authStatus === 'authenticated'
                ? t('devtools.credentialPresent')
                : t('devtools.credentialEmpty')}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {t('devtools.activeApiLabel')}: {effectiveApiBaseUrl}
            </AppText>
          </VStack>

          {feedbackBanner ? (
            <Box p="sm" bg="surfaceMuted" radius="md" bordered>
              <AppText variant="caption" tone="brand">
                {feedbackBanner}
              </AppText>
            </Box>
          ) : null}

          <VStack p="md" gap="sm" bg="surface" radius="md" bordered>
            <AppText variant="bodySm" weight="600">
              {t('devtools.overrideSectionTitle')}
            </AppText>
            <TextField
              placeholder={t('devtools.overridePlaceholder')}
              value={draftUrl}
              onChangeText={(next) => {
                setDraftUrlOverride(next);
                if (urlError) {
                  setUrlError(undefined);
                }
              }}
              errorMessage={urlError}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <HStack gap="sm">
              <Box flex={1}>
                <Button label={t('devtools.applyUrlButton')} onPress={handleApplyUrl} />
              </Box>
              <Box flex={1}>
                <Button
                  label={t('devtools.resetUrlButton')}
                  variant="outline"
                  onPress={handleResetUrl}
                />
              </Box>
            </HStack>
          </VStack>

          <VStack p="md" gap="sm" bg="surface" radius="md" bordered>
            <AppText variant="bodySm" weight="600">
              {t('devtools.quickActionsTitle')}
            </AppText>
            <Button
              label={t('devtools.simulateExpireButton')}
              variant="secondary"
              onPress={handleSimulateExpire}
            />
            <Button
              label={t('devtools.clearCacheButton')}
              variant="outline"
              onPress={handleClearCaches}
            />
            <Button
              label={t('devtools.resetPrivacyButton')}
              variant="danger"
              onPress={handleResetPrivacy}
            />
          </VStack>

          <VStack p="md" gap="xs" bg="surfaceMuted" radius="md" bordered>
            <AppText variant="bodySm" weight="600">
              {t('devtools.recentLogsTitle')}
            </AppText>
            {recentLogs.length === 0 ? (
              <AppText variant="caption" tone="secondary">
                {t('devtools.emptyLogsHint')}
              </AppText>
            ) : (
              recentLogs.map((entry, idx) => (
                <AppText key={`${entry.timestamp}-${idx}`} variant="caption" tone="secondary">
                  [{entry.level.toUpperCase()}] {entry.message}
                </AppText>
              ))
            )}
          </VStack>
        </VStack>
      </ScrollView>
    </BottomSheetModal>
  );
}

// 原因：仅在非生产变体且抽屉展开时才挂载视图与状态订阅，确保正式包零渲染开销且关闭态零后台重绘
export function DevToolsDrawerHost(props: DevToolsDrawerHostProps): React.JSX.Element | null {
  const enabled = useStore(props.devToolsStore, (state) => state.enabled);
  const drawerOpen = useStore(props.devToolsStore, (state) => state.drawerOpen);

  if (!enabled || !drawerOpen) {
    return null;
  }

  return <OpenDevToolsDrawerContent {...props} />;
}

const styles = StyleSheet.create({
  scrollArea: {
    maxHeight: 460,
  },
});

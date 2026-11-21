import React from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Platform } from 'react-native';
import { useStore } from 'zustand';
import type { AppIdentity, LegalDocumentTarget, RuntimePublicEnv } from '../config/types';
import { AppText, Box, Button, Screen, VStack } from '../ui';
import type { PrivacyGateStore } from './privacy-gate-store';

export interface PrivacyGateViewProps {
  identity: AppIdentity;
  env: RuntimePublicEnv;
  privacyGateStore: PrivacyGateStore;
  onOpenLegalDocument?: (doc: LegalDocumentTarget) => void;
}

export function PrivacyGateView({
  identity,
  env,
  privacyGateStore,
  onOpenLegalDocument,
}: PrivacyGateViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const declinedNoticeVisible = useStore(privacyGateStore, (state) => state.declinedNoticeVisible);
  const acceptPrivacyPolicy = useStore(privacyGateStore, (state) => state.acceptPrivacyPolicy);
  const declinePrivacyPolicy = useStore(privacyGateStore, (state) => state.declinePrivacyPolicy);

  // 原因：BackHandler.exitApp 仅 Android 生效，iOS 上无反应且 Apple 审核不鼓励程序化退出；iOS 只保留提示，用户可随时重新同意
  const canExitAppProgrammatically = Platform.OS === 'android';

  return (
    <Screen scrollable>
      <VStack flex={1} justify="center" gap="lg" py="xl">
        <VStack p="xl" gap="md" bg="surface" radius="lg" bordered>
          <Box px="sm" py="xs" bg="primarySoft" radius="sm" align="center">
            <AppText variant="caption" tone="brand" weight="600">
              {identity.displayName} · v{identity.privacyPolicyVersion}
            </AppText>
          </Box>

          <AppText variant="titleLg" align="center">
            {t('privacy.title')}
          </AppText>

          <AppText variant="bodyMd" tone="secondary">
            {t('privacy.summary')}
          </AppText>

          <VStack gap="xs" p="md" bg="surfaceMuted" radius="md">
            {onOpenLegalDocument ? (
              <>
                <Button
                  label={t('privacy.userAgreementLink')}
                  variant="ghost"
                  onPress={() =>
                    onOpenLegalDocument({
                      url: env.userAgreementUrl,
                      title: t('privacy.userAgreementTitle'),
                    })
                  }
                />
                <Button
                  label={t('privacy.privacyPolicyLink')}
                  variant="ghost"
                  onPress={() =>
                    onOpenLegalDocument({
                      url: env.privacyPolicyUrl,
                      title: t('privacy.privacyPolicyTitle'),
                    })
                  }
                />
              </>
            ) : (
              <>
                <AppText variant="caption" tone="brand">
                  {env.userAgreementUrl}
                </AppText>
                <AppText variant="caption" tone="brand">
                  {env.privacyPolicyUrl}
                </AppText>
              </>
            )}
          </VStack>

          {declinedNoticeVisible ? (
            <VStack p="md" gap="sm" bg="surfaceMuted" radius="md" bordered>
              <AppText variant="bodySm" tone="danger">
                {t(canExitAppProgrammatically ? 'privacy.declinedHint' : 'privacy.declinedHintIos')}
              </AppText>
              {canExitAppProgrammatically ? (
                <Button
                  label={t('privacy.exitAppButton')}
                  variant="danger"
                  onPress={() => {
                    BackHandler.exitApp();
                  }}
                />
              ) : null}
            </VStack>
          ) : null}

          <VStack gap="sm">
            <Button label={t('privacy.agreeButton')} onPress={acceptPrivacyPolicy} />
            <Button
              label={t('privacy.declineButton')}
              variant="outline"
              onPress={declinePrivacyPolicy}
            />
          </VStack>
        </VStack>
      </VStack>
    </Screen>
  );
}

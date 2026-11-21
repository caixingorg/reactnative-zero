import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { AppText, BottomSheetModal, Button, VStack } from '../ui';
import type { PermissionPromptStore } from './permission-coordinator';

export interface PermissionPromptHostProps {
  promptStore: PermissionPromptStore;
}

export function PermissionPromptHost({
  promptStore,
}: PermissionPromptHostProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const activePrompt = useStore(promptStore, (state) => state.activePrompt);
  const confirmPrompt = useStore(promptStore, (state) => state.confirmPrompt);
  const cancelPrompt = useStore(promptStore, (state) => state.cancelPrompt);

  // 原因：当宿主因隐私门禁重置或路由切走卸载时主动释放当前弹窗锁，防止排队 Promise 永久挂起
  useEffect(() => {
    return () => {
      promptStore.getState().cancelPrompt();
    };
  }, [promptStore]);

  if (!activePrompt) {
    return null;
  }

  const primaryLabel =
    activePrompt.mode === 'rationale'
      ? t('permissions.continueButton')
      : t('permissions.openSettingsButton');

  return (
    <BottomSheetModal visible title={activePrompt.title} onClose={cancelPrompt}>
      <VStack gap="md">
        <AppText variant="bodyMd" tone="secondary">
          {activePrompt.description}
        </AppText>
        <VStack gap="sm">
          <Button label={primaryLabel} onPress={confirmPrompt} />
          <Button label={t('common.cancel')} variant="outline" onPress={cancelPrompt} />
        </VStack>
      </VStack>
    </BottomSheetModal>
  );
}

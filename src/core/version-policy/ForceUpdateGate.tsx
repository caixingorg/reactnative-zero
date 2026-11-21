import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { useStore } from 'zustand';
import { EmptyState, Screen } from '../ui';
import type { VersionPolicyStore } from './version-policy';

export interface ForceUpdateGateProps {
  store: VersionPolicyStore;
  children: React.ReactNode;
}

// 原因：低于最低版本时用阻断页替换整个应用界面，没有任何返回或跳过入口；其余状态（含未知与失败）一律放行
export function ForceUpdateGate({ store, children }: ForceUpdateGateProps): React.JSX.Element {
  const { t } = useTranslation();
  const status = useStore(store, (state) => state.status);
  const updateUrl = useStore(store, (state) => state.updateUrl);

  if (status !== 'update-required') {
    return <>{children}</>;
  }

  return (
    <Screen>
      <EmptyState
        title={t('versionPolicy.updateRequiredTitle')}
        description={t('versionPolicy.updateRequiredDescription')}
        actionLabel={updateUrl ? t('versionPolicy.updateAction') : undefined}
        onAction={updateUrl ? () => void Linking.openURL(updateUrl) : undefined}
      />
    </Screen>
  );
}

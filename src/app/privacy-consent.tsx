import React from 'react';
import { PrivacyGateView } from '@/core/bootstrap/PrivacyGateView';
import { useAppRuntime } from '@/core/runtime';
import { useLegalDocumentOpener } from '@/shared';

export default function PrivacyConsentRoute(): React.JSX.Element {
  const { identity, env, privacyGateStore } = useAppRuntime();
  const openLegalDocument = useLegalDocumentOpener();

  return (
    <PrivacyGateView
      identity={identity}
      env={env}
      privacyGateStore={privacyGateStore}
      onOpenLegalDocument={openLegalDocument}
    />
  );
}

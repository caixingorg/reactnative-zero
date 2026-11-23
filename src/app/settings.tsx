import { useRouter } from 'expo-router';
import React from 'react';
import { useAppRuntime } from '@/core/runtime';
import { SettingsScreen } from '@/features/settings';
import { useLegalDocumentOpener, useSafeBack } from '@/shared';

export default function SettingsStackRoute(): React.JSX.Element {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { preferencesStore } = useAppRuntime();
  const openLegalDocument = useLegalDocumentOpener();

  return (
    <SettingsScreen
      onBack={safeBack}
      onOpenLegalDocument={openLegalDocument}
      onOpenDeveloperLab={() => router.push('/developer-lab')}
      onReplayWelcome={() => preferencesStore.getState().resetWelcome()}
    />
  );
}

import { useRouter } from 'expo-router';
import React from 'react';
import { useAppRuntime } from '@/core/runtime';
import { SettingsScreen } from '@/features/settings';
import { useLegalDocumentOpener } from '@/shared';

export default function SettingsStackRoute(): React.JSX.Element {
  const router = useRouter();
  const { preferencesStore } = useAppRuntime();
  const openLegalDocument = useLegalDocumentOpener();

  return (
    <SettingsScreen
      onBack={() => router.back()}
      onOpenLegalDocument={openLegalDocument}
      onOpenDeveloperLab={() => router.push('/developer-lab')}
      onReplayWelcome={() => preferencesStore.getState().resetWelcome()}
    />
  );
}

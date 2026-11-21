import { useRouter } from 'expo-router';
import React from 'react';
import { SettingsScreen } from '@/features/settings';
import { useLegalDocumentOpener } from '@/shared';

export default function SettingsStackRoute(): React.JSX.Element {
  const router = useRouter();
  const openLegalDocument = useLegalDocumentOpener();

  return (
    <SettingsScreen
      onBack={() => router.back()}
      onOpenLegalDocument={openLegalDocument}
      onOpenDeveloperLab={() => router.push('/developer-lab')}
    />
  );
}

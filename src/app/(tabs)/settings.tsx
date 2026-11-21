import React from 'react';
import { SettingsScreen } from '@/features/settings';
import { useLegalDocumentOpener } from '@/shared';

export default function SettingsTabRoute(): React.JSX.Element {
  const openLegalDocument = useLegalDocumentOpener();

  return <SettingsScreen onOpenLegalDocument={openLegalDocument} />;
}

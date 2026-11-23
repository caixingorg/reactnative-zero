import React from 'react';
import { AppHeader, Screen } from '@/core/ui';
import { CapabilitiesLabScreen } from '@/features/capabilities-lab';
import { useSafeBack } from '@/shared';

export default function DeveloperLabStackRoute(): React.JSX.Element {
  const safeBack = useSafeBack();
  return (
    <Screen>
      <AppHeader title="开发者能力实验室" showBack onBack={safeBack} />
      <CapabilitiesLabScreen />
    </Screen>
  );
}

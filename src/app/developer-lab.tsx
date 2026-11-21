import { useRouter } from 'expo-router';
import React from 'react';
import { AppHeader, Screen } from '@/core/ui';
import { CapabilitiesLabScreen } from '@/features/capabilities-lab';

export default function DeveloperLabStackRoute(): React.JSX.Element {
  const router = useRouter();
  return (
    <Screen>
      <AppHeader title="开发者能力实验室" showBack onBack={() => router.back()} />
      <CapabilitiesLabScreen />
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import React from 'react';
import { ProfileRegisterDemoScreen } from '@/features/demo';

export default function RegisterDemoRoute(): React.JSX.Element {
  const router = useRouter();

  return <ProfileRegisterDemoScreen onBack={() => router.back()} />;
}

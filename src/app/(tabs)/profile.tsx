import { useRouter } from 'expo-router';
import React from 'react';
import { ProfileScreen } from '@/features/profile';

export default function ProfileTabRoute(): React.JSX.Element {
  const router = useRouter();
  return <ProfileScreen onOpenSettings={() => router.push('/settings')} />;
}

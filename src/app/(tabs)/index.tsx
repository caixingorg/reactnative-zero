import { useRouter } from 'expo-router';
import React from 'react';
import { HomeStarterScreen } from '@/features/home';

export default function HomeTabRoute(): React.JSX.Element {
  const router = useRouter();
  return (
    <HomeStarterScreen
      onSelectItem={(id) => router.push(`/feed/${id}`)}
      onOpenSearch={() => router.push('/search')}
    />
  );
}

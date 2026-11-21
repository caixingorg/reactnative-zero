import { useRouter } from 'expo-router';
import React from 'react';
import { SearchScreen } from '@/features/templates';

export default function SearchStackRoute(): React.JSX.Element {
  const router = useRouter();

  return (
    <SearchScreen onBack={() => router.back()} onSelectResult={() => router.push('/detail')} />
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { FeedDetailScreen } from '@/features/home';

export default function FeedDetailRoute(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const itemId = typeof params.id === 'string' ? params.id : '';

  return <FeedDetailScreen itemId={itemId} onBack={() => router.back()} />;
}

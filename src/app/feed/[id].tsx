import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FeedDetailScreen } from '@/features/home';
import { useSafeBack } from '@/shared';

export default function FeedDetailRoute(): React.JSX.Element {
  const safeBack = useSafeBack();
  const params = useLocalSearchParams<{ id?: string }>();
  const itemId = typeof params.id === 'string' ? params.id : '';

  return <FeedDetailScreen itemId={itemId} onBack={safeBack} />;
}

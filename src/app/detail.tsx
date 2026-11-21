import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ContentDetailScreen } from '@/features/templates';

export default function ContentDetailStackRoute(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string }>();
  const title =
    typeof params.title === 'string' && params.title.length > 0 ? params.title : undefined;

  return <ContentDetailScreen title={title} onBack={() => router.back()} />;
}

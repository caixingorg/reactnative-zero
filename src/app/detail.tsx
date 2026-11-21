import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ContentDetailScreen } from '@/features/templates';

export default function ContentDetailStackRoute(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; subtitle?: string; body?: string }>();
  const title =
    typeof params.title === 'string' && params.title.length > 0 ? params.title : undefined;
  const subtitle =
    typeof params.subtitle === 'string' && params.subtitle.length > 0 ? params.subtitle : undefined;
  const body = typeof params.body === 'string' && params.body.length > 0 ? params.body : undefined;

  return (
    <ContentDetailScreen
      title={title}
      subtitle={subtitle}
      body={body}
      onBack={() => router.back()}
    />
  );
}

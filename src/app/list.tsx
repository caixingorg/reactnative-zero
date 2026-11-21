import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { GenericListScreen } from '@/features/demo';

export default function GenericListStackRoute(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string }>();
  const title = typeof params.title === 'string' && params.title.length > 0 ? params.title : '列表';

  return (
    <GenericListScreen
      title={title}
      onBack={() => router.back()}
      onSelectItem={() => router.push('/detail')}
    />
  );
}

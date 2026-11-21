import { useRouter } from 'expo-router';
import React from 'react';
import { DiscoverScreen } from '@/features/discover';

export default function DiscoverTabRoute(): React.JSX.Element {
  const router = useRouter();
  return (
    <DiscoverScreen
      onOpenSearch={() => router.push('/search')}
      onSelectRecord={(record) =>
        router.push({
          pathname: '/detail',
          params: {
            title: record.title,
            subtitle: `${record.tag} · ${record.meta}`,
            body: record.summary,
          },
        })
      }
    />
  );
}

import { useRouter } from 'expo-router';
import React from 'react';
import { HomeStarterScreen } from '@/features/home';

export default function HomeTabRoute(): React.JSX.Element {
  const router = useRouter();
  return (
    <HomeStarterScreen
      onSelectItem={(id) => router.push(`/feed/${id}`)}
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
      onOpenSearch={() => router.push('/search')}
    />
  );
}

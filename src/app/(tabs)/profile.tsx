import { useRouter } from 'expo-router';
import React from 'react';
import { ProfileScreen } from '@/features/profile';

export default function ProfileTabRoute(): React.JSX.Element {
  const router = useRouter();
  return (
    <ProfileScreen
      onOpenSettings={() => router.push('/settings')}
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

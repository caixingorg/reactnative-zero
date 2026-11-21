import { useRouter } from 'expo-router';
import React from 'react';
import { MessagesScreen } from '@/features/messages';

export default function MessagesTabRoute(): React.JSX.Element {
  const router = useRouter();
  return (
    <MessagesScreen
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

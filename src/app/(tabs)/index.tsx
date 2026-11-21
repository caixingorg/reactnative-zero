import { useRouter } from 'expo-router';
import React from 'react';
import { useAppRuntime } from '@/core/runtime';
import { HomeStarterScreen } from '@/features/home';
import { useLegalDocumentOpener } from '@/shared';

export default function HomeTabRoute(): React.JSX.Element {
  const router = useRouter();
  const { env } = useAppRuntime();
  const openLegalDocument = useLegalDocumentOpener();

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
      onOpenWebView={() =>
        openLegalDocument({
          url: env.privacyPolicyUrl,
          title: '架构白皮书专题',
        })
      }
    />
  );
}

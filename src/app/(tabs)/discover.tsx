import { useRouter } from 'expo-router';
import React from 'react';
import { useAppRuntime } from '@/core/runtime';
import { DiscoverScreen } from '@/features/discover';
import { useLegalDocumentOpener } from '@/shared';

export default function DiscoverTabRoute(): React.JSX.Element {
  const router = useRouter();
  const { env } = useAppRuntime();
  const openLegalDocument = useLegalDocumentOpener();

  return (
    <DiscoverScreen
      onOpenSearch={() => router.push('/search')}
      onOpenWebView={() =>
        openLegalDocument({
          url: env.userAgreementUrl,
          title: 'H5 轻应用容器',
        })
      }
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

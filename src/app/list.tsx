import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { GenericListScreen } from '@/features/content';
import { useSafeBack } from '@/shared';

export default function GenericListStackRoute(): React.JSX.Element {
  const router = useRouter();
  const safeBack = useSafeBack();
  const params = useLocalSearchParams<{ title?: string }>();
  const title = typeof params.title === 'string' && params.title.length > 0 ? params.title : '列表';

  return (
    <GenericListScreen
      title={title}
      onBack={safeBack}
      onSelectItem={(_id, item) =>
        router.push({
          pathname: '/detail',
          params: { title: item.title, summary: item.subtitle, tag: title },
        })
      }
    />
  );
}

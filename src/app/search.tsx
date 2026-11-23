import { useRouter } from 'expo-router';
import React from 'react';
import { SearchScreen } from '@/features/search';
import { useSafeBack } from '@/shared';

export default function SearchStackRoute(): React.JSX.Element {
  const router = useRouter();
  const safeBack = useSafeBack();

  return (
    <SearchScreen
      onBack={safeBack}
      onSelectResult={(_id, item) =>
        router.push({
          pathname: '/detail',
          params: { title: item.title, tag: item.category },
        })
      }
    />
  );
}

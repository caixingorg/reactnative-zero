import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StatusPageScreen, type StatusPageKind } from '@/features/content';
import { useSafeBack } from '@/shared';

function parseKind(raw: string | string[] | undefined): StatusPageKind {
  if (raw === 'empty' || raw === 'error' || raw === 'offline' || raw === 'not-found') {
    return raw;
  }
  return 'empty';
}

export default function StatusStackRoute(): React.JSX.Element {
  const safeBack = useSafeBack();
  const params = useLocalSearchParams<{ kind?: string; title?: string }>();
  const title =
    typeof params.title === 'string' && params.title.length > 0 ? params.title : '状态页';

  return <StatusPageScreen kind={parseKind(params.kind)} title={title} onBack={safeBack} />;
}

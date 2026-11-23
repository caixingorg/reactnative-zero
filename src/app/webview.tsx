import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { WebViewScreen } from '@/features/webview';
import { useSafeBack } from '@/shared';

export default function WebViewRoute(): React.JSX.Element {
  const safeBack = useSafeBack();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const url = typeof params.url === 'string' ? params.url : '';
  const title = typeof params.title === 'string' ? params.title : undefined;

  return <WebViewScreen url={url} title={title} onClose={safeBack} />;
}

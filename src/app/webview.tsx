import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { WebViewScreen } from '@/features/webview';

export default function WebViewRoute(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const url = typeof params.url === 'string' ? params.url : '';
  const title = typeof params.title === 'string' ? params.title : undefined;

  // 原因：深链接或冷启动直接打开 webview 时没有返回栈，router.back() 会抛出未处理的 GO_BACK；回退到根路由交由守卫重定向
  const handleClose = (): void => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  return <WebViewScreen url={url} title={title} onClose={handleClose} />;
}

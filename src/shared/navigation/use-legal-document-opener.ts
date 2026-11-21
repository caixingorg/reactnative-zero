import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Linking } from 'react-native';
import type { LegalDocumentTarget } from '@/core/config/types';
import { normalizeHttpBaseUrl } from '@/core/config/url-validator';
import { useAppRuntime } from '@/core/runtime';

// 原因：收敛协议文档跳转入口，当启用内嵌 WebView 时走应用内安全容器，关闭时安全回退至系统外部浏览器
export function useLegalDocumentOpener(): (doc: LegalDocumentTarget) => void {
  const router = useRouter();
  const { identity } = useAppRuntime();

  return useCallback(
    (doc: LegalDocumentTarget) => {
      if (identity.capabilities.webview) {
        router.push({
          pathname: '/webview',
          params: { url: doc.url, title: doc.title },
        });
        return;
      }

      if (normalizeHttpBaseUrl(doc.url)) {
        void Linking.openURL(doc.url);
      }
    },
    [identity.capabilities.webview, router],
  );
}

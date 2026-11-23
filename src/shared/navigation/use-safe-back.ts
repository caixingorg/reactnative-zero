import { useRouter } from 'expo-router';
import { useCallback } from 'react';

// 原因：深链接、冷启动或热重载停留在栈页面时返回栈可能为空，直接调用 router.back() 会触发未处理的 GO_BACK 警告；
// 统一先检查 router.canGoBack()，栈为空时回退至根路由交由守卫重定向
export function useSafeBack(fallbackHref: '/' = '/'): () => void {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallbackHref);
  }, [fallbackHref, router]);
}

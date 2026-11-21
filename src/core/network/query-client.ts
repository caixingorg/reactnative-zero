import { QueryClient } from '@tanstack/react-query';

export interface CreateAppQueryClientOptions {
  staleTimeMs?: number;
  gcTimeMs?: number;
  retry?: boolean | number;
}

// 原因：每次创建运行时均生成独立 QueryClient；缓存周期与重试次数通过显式参数注入，生产代码零测试环境嗅探分支
export function createAppQueryClient(options: CreateAppQueryClientOptions = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: options.staleTimeMs ?? 30_000,
        gcTime: options.gcTimeMs ?? 5 * 60_000,
        retry: options.retry ?? 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

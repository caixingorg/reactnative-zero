import type { HttpTransportDriver } from '@/core/network/types';

// 原因：production 构建变体由 metro.config.js 将本地 Mock 网关解析至此空桩，确保正式包零测试账号与模拟数据残留
export function createMockHttpTransport(): HttpTransportDriver {
  return async () => {
    throw new Error('Mock HTTP transport is physically stripped from production builds.');
  };
}

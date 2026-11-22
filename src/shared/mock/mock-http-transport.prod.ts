import type { HttpTransportDriver } from '@/core/network/types';

// 原因：production 构建变体由 metro.config.js 将本地演示网关解析至此空桩，确保正式包零演示账号与模拟数据残留
export function createDemoHttpTransport(): HttpTransportDriver {
  return async () => {
    throw new Error('Demo HTTP transport is physically stripped from production builds.');
  };
}

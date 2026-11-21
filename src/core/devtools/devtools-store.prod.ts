import { createStore } from 'zustand/vanilla';
import type { AppVariant, RuntimePublicEnv } from '../config/types';
import type { CreateDevToolsStoreOptions, DevToolsState, DevToolsStore } from './devtools-store';

export { normalizeHttpBaseUrl } from '../config/url-validator';

export function isDevToolsEnabledForVariant(_variant: AppVariant): boolean {
  return false;
}

export function isDevToolsEnabled(
  _env: Pick<RuntimePublicEnv, 'appVariant' | 'enableDevTools'>,
): boolean {
  return false;
}

// 原因：production 构建变体由 metro.config.js 将 devtools-store 解析至此只读空桩，彻底剥离模拟过期令牌、动态改址与清缓存逻辑
export function createDevToolsStore({ env }: CreateDevToolsStoreOptions): DevToolsStore {
  return createStore<DevToolsState>(() => ({
    enabled: false,
    drawerOpen: false,
    overrideApiBaseUrl: undefined,
    effectiveApiBaseUrl: env.apiBaseUrl,
    openDrawer: () => {},
    closeDrawer: () => {},
    applyApiBaseUrlOverride: () => ({ ok: false, errorCode: 'disabled' }),
    resetApiBaseUrlOverride: () => {},
    simulateAccessTokenExpiration: async () => {},
    clearLocalCaches: () => {},
    resetPrivacyGate: () => {},
  }));
}

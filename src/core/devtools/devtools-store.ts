/**
 * @module core/devtools/devtools-store
 * 职责：非生产环境悬浮调试抽屉的状态源（动态覆盖 API BaseURL、模拟过期 Token、重置隐私/缓存）。
 * 边界：`APP_VARIANT=production` 打包时由 `metro.config.js` 物理替换为 `devtools-store.prod.ts` 空桩，不进入生产包。
 */
import type { QueryClient } from '@tanstack/react-query';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { ACCESS_TOKEN_SECRET_KEY, INSTALL_SESSION_MARKER_KEY } from '../auth/auth-session-store';
import {
  ACCEPTED_PRIVACY_VERSION_KEY,
  type PrivacyGateStore,
} from '../bootstrap/privacy-gate-store';
import type { AppVariant, RuntimePublicEnv } from '../config/types';
import { normalizeHttpBaseUrl } from '../config/url-validator';
import type { Logger } from '../observability/observability';
import type { PreferencesStore } from '../preferences/preferences-store';
import type { KeyValueStorageDriver, SecretStorageDriver } from '../storage/types';

export { normalizeHttpBaseUrl } from '../config/url-validator';

export const DEVTOOLS_API_URL_OVERRIDE_KEY = 'devtools.api_base_url_override';
export const SIMULATED_EXPIRED_ACCESS_TOKEN = 'simulated-expired-access-token';

export interface ApplyUrlOverrideResult {
  ok: boolean;
  errorCode?: 'disabled' | 'invalid-url';
}

export interface DevToolsState {
  enabled: boolean;
  drawerOpen: boolean;
  overrideApiBaseUrl: string | undefined;
  effectiveApiBaseUrl: string;
  openDrawer: () => void;
  closeDrawer: () => void;
  applyApiBaseUrlOverride: (rawUrl: string) => ApplyUrlOverrideResult;
  resetApiBaseUrlOverride: () => void;
  simulateAccessTokenExpiration: () => Promise<void>;
  clearLocalCaches: () => void;
  resetPrivacyGate: () => void;
}

export type DevToolsStore = StoreApi<DevToolsState>;

export interface CreateDevToolsStoreOptions {
  env: RuntimePublicEnv;
  keyValueStorage: KeyValueStorageDriver;
  secretStorage: SecretStorageDriver;
  queryClient: QueryClient;
  privacyGateStore: PrivacyGateStore;
  preferencesStore?: PreferencesStore;
  logger: Logger;
}

export function isDevToolsEnabledForVariant(variant: AppVariant): boolean {
  return variant !== 'production';
}

// 原因：DevTools 唯一判定入口：生产变体恒关闭，非生产变体再受 env.enableDevTools 开关控制（缺省视为开启）
export function isDevToolsEnabled(
  env: Pick<RuntimePublicEnv, 'appVariant' | 'enableDevTools'>,
): boolean {
  return isDevToolsEnabledForVariant(env.appVariant) && env.enableDevTools !== false;
}

function createDisabledProductionDevToolsStore(apiBaseUrl: string): DevToolsStore {
  return createStore<DevToolsState>(() => ({
    enabled: false,
    drawerOpen: false,
    overrideApiBaseUrl: undefined,
    effectiveApiBaseUrl: apiBaseUrl,
    openDrawer: () => {},
    closeDrawer: () => {},
    applyApiBaseUrlOverride: () => ({ ok: false, errorCode: 'disabled' }),
    resetApiBaseUrlOverride: () => {},
    simulateAccessTokenExpiration: async () => {},
    clearLocalCaches: () => {},
    resetPrivacyGate: () => {},
  }));
}

// 原因：生产变体直接返回零逻辑只读空桩，非生产变体清缓存时保留隐私授权版本以区分“清缓存”与“重置隐私门禁”
export function createDevToolsStore({
  env,
  keyValueStorage,
  secretStorage,
  queryClient,
  privacyGateStore,
  preferencesStore,
  logger,
}: CreateDevToolsStoreOptions): DevToolsStore {
  if (!isDevToolsEnabled(env)) {
    return createDisabledProductionDevToolsStore(env.apiBaseUrl);
  }

  const initialOverride =
    normalizeHttpBaseUrl(keyValueStorage.getString(DEVTOOLS_API_URL_OVERRIDE_KEY)) ?? undefined;

  return createStore<DevToolsState>((set) => ({
    enabled: true,
    drawerOpen: false,
    overrideApiBaseUrl: initialOverride,
    effectiveApiBaseUrl: initialOverride ?? env.apiBaseUrl,

    openDrawer: () => {
      set({ drawerOpen: true });
    },

    closeDrawer: () => {
      set({ drawerOpen: false });
    },

    applyApiBaseUrlOverride: (rawUrl: string): ApplyUrlOverrideResult => {
      const normalized = normalizeHttpBaseUrl(rawUrl);
      if (!normalized) {
        return { ok: false, errorCode: 'invalid-url' };
      }
      keyValueStorage.setString(DEVTOOLS_API_URL_OVERRIDE_KEY, normalized);
      set({
        overrideApiBaseUrl: normalized,
        effectiveApiBaseUrl: normalized,
      });
      queryClient.clear();
      logger.info('DevTools applied live API Base URL override', {
        effectiveApiBaseUrl: normalized,
      });
      return { ok: true };
    },

    resetApiBaseUrlOverride: () => {
      keyValueStorage.deleteKey(DEVTOOLS_API_URL_OVERRIDE_KEY);
      set({
        overrideApiBaseUrl: undefined,
        effectiveApiBaseUrl: env.apiBaseUrl,
      });
      queryClient.clear();
      logger.info('DevTools restored default API Base URL', {
        effectiveApiBaseUrl: env.apiBaseUrl,
      });
    },

    simulateAccessTokenExpiration: async () => {
      await secretStorage.setSecret(ACCESS_TOKEN_SECRET_KEY, SIMULATED_EXPIRED_ACCESS_TOKEN);
      logger.warn('DevTools simulated expired access token');
    },

    clearLocalCaches: () => {
      const preservedPrivacyVersion = keyValueStorage.getString(ACCEPTED_PRIVACY_VERSION_KEY);
      const preservedInstallMarker = keyValueStorage.getBoolean(INSTALL_SESSION_MARKER_KEY);
      keyValueStorage.clearAll();
      if (preservedPrivacyVersion !== undefined) {
        keyValueStorage.setString(ACCEPTED_PRIVACY_VERSION_KEY, preservedPrivacyVersion);
      }
      if (preservedInstallMarker !== undefined) {
        keyValueStorage.setBoolean(INSTALL_SESSION_MARKER_KEY, preservedInstallMarker);
      }
      queryClient.clear();
      preferencesStore?.getState().resetPreferences();
      set({
        overrideApiBaseUrl: undefined,
        effectiveApiBaseUrl: env.apiBaseUrl,
      });
      logger.info('DevTools cleared non-secret KV caches and Query cache');
    },

    resetPrivacyGate: () => {
      set({ drawerOpen: false });
      privacyGateStore.getState().resetPrivacyConsent();
      logger.info('DevTools reset Privacy Gate consent state');
    },
  }));
}

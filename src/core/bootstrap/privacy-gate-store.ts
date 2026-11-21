/**
 * @module core/bootstrap/privacy-gate-store
 * 职责：两阶段隐私合规门禁状态机（ADR-0004），管控用户同意状态、协议升版重签与 Phase 2 延迟 SDK 初始化/撤回钩子。
 * 边界：任何读取设备标识符或上报遥测的第三方 SDK 必须经由 `DeferredSdkInitializer` 注册，严禁在模块加载期直接初始化。
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppIdentity } from '../config/types';
import type { ObservabilitySuite } from '../observability/observability';
import type { KeyValueStorageDriver } from '../storage/types';

export const ACCEPTED_PRIVACY_VERSION_KEY = 'compliance.accepted_privacy_version';

export type BootstrapPhase = 'awaiting-consent' | 'ready';

export interface DeferredSdkInitializer {
  id: string;
  init: () => void | Promise<void>;
  onConsentRevoked?: () => void;
}

export interface PrivacyGateState {
  phase: BootstrapPhase;
  acceptedVersion: string | undefined;
  declinedNoticeVisible: boolean;
  phase2Initialized: boolean;
  acceptPrivacyPolicy: () => void;
  declinePrivacyPolicy: () => void;
  resetPrivacyConsent: () => void;
  ensurePhase2Initialized: () => void;
}

export type PrivacyGateStore = StoreApi<PrivacyGateState>;

export interface CreatePrivacyGateStoreOptions {
  identity: AppIdentity;
  keyValueStorage: KeyValueStorageDriver;
  observability: ObservabilitySuite;
  deferredInitializers?: DeferredSdkInitializer[];
}

export function hasGrantedCurrentPrivacyConsent(
  identity: AppIdentity,
  keyValueStorage: KeyValueStorageDriver,
): boolean {
  if (!identity.compliance.requirePrivacyConsent) {
    return true;
  }
  return keyValueStorage.getString(ACCEPTED_PRIVACY_VERSION_KEY) === identity.privacyPolicyVersion;
}

// 原因：遵循 ADR-0004，严格拦截未授权前的二阶段敏感 SDK 唤醒，满足国内应用市场审核红线并支持协议升版重签
export function createPrivacyGateStore({
  identity,
  keyValueStorage,
  observability,
  deferredInitializers = [],
}: CreatePrivacyGateStoreOptions): PrivacyGateStore {
  const storedVersion = keyValueStorage.getString(ACCEPTED_PRIVACY_VERSION_KEY);
  const initialPhase: BootstrapPhase = hasGrantedCurrentPrivacyConsent(identity, keyValueStorage)
    ? 'ready'
    : 'awaiting-consent';

  const executedIds = new Set<string>();

  function runPhase2Hooks(): void {
    const builtInHooks: DeferredSdkInitializer[] = [
      {
        id: 'core:error-reporter',
        init: () => observability.errorReporter.initialize(),
        onConsentRevoked: () => observability.errorReporter.suspend?.(),
      },
      {
        id: 'core:analytics',
        init: () => observability.analytics.initialize(),
        onConsentRevoked: () => observability.analytics.suspend?.(),
      },
      ...deferredInitializers,
    ];

    for (const hook of builtInHooks) {
      if (executedIds.has(hook.id)) {
        continue;
      }
      executedIds.add(hook.id);
      try {
        const maybePromise = hook.init();
        if (maybePromise instanceof Promise) {
          void maybePromise.catch((err: unknown) => {
            observability.logger.error(`Deferred SDK initializer failed [${hook.id}]`, {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      } catch (err) {
        observability.logger.error(`Deferred SDK initializer threw [${hook.id}]`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  function revokePhase2Hooks(): void {
    observability.revokeConsent();
    executedIds.delete('core:error-reporter');
    executedIds.delete('core:analytics');

    for (const hook of deferredInitializers) {
      if (hook.onConsentRevoked) {
        try {
          hook.onConsentRevoked();
        } catch (err) {
          observability.logger.error(`Deferred SDK revoke handler threw [${hook.id}]`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        executedIds.delete(hook.id);
      }
    }
  }

  return createStore<PrivacyGateState>((set, get) => ({
    phase: initialPhase,
    acceptedVersion: storedVersion,
    declinedNoticeVisible: false,
    phase2Initialized: false,
    ensurePhase2Initialized: () => {
      const current = get();
      if (current.phase !== 'ready' || current.phase2Initialized) {
        return;
      }
      set({ phase2Initialized: true });
      runPhase2Hooks();
    },
    acceptPrivacyPolicy: () => {
      keyValueStorage.setString(ACCEPTED_PRIVACY_VERSION_KEY, identity.privacyPolicyVersion);
      set({
        phase: 'ready',
        acceptedVersion: identity.privacyPolicyVersion,
        declinedNoticeVisible: false,
      });
      get().ensurePhase2Initialized();
    },
    declinePrivacyPolicy: () => {
      set({ declinedNoticeVisible: true });
    },
    resetPrivacyConsent: () => {
      keyValueStorage.deleteKey(ACCEPTED_PRIVACY_VERSION_KEY);
      if (identity.compliance.requirePrivacyConsent) {
        revokePhase2Hooks();
        set({
          phase: 'awaiting-consent',
          acceptedVersion: undefined,
          declinedNoticeVisible: false,
          phase2Initialized: false,
        });
        return;
      }
      set({
        phase: 'ready',
        acceptedVersion: undefined,
        declinedNoticeVisible: false,
      });
    },
  }));
}

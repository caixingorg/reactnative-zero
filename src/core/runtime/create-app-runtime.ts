/**
 * @module core/runtime/create-app-runtime
 * 职责：依赖注入容器的装配逻辑——按依赖顺序创建存储、可观测性、i18n、鉴权、隐私门禁、网络、权限与 OTA，返回单一 AppRuntime 实例。
 * 边界：严禁静态导入 `src/core/capabilities/*`；严禁直接导入 `app.identity.ts`（须由上层注入）；装配顺序是行为的一部分，调整前先读注释。
 */
import Constants from 'expo-constants';
import { createAuthSessionStore, hasPreExistingSandboxState } from '../auth/auth-session-store';
import {
  createPrivacyGateStore,
  hasGrantedCurrentPrivacyConsent,
} from '../bootstrap/privacy-gate-store';
import { parseRuntimeEnv, parseRuntimePublicEnv } from '../config/env-schema';
import type { RuntimePublicEnv } from '../config/types';
import { createDevToolsStore } from '../devtools/devtools-store';
import { createAppI18n, detectDeviceLanguage, normalizeSupportedLanguage } from '../i18n/i18n';
import type { SupportedLanguage } from '../i18n/resources';
import { createDefaultBackendAdapter } from '../network/default-backend-adapter';
import { createHttpClient } from '../network/http-client';
import { createConnectivityStore, createNativeNetworkMonitor } from '../network/network-monitor';
import { createAppQueryClient } from '../network/query-client';
import { attachOptInQueryPersistence } from '../network/query-persistence';
import { createObservabilitySuite } from '../observability/observability';
import { createPermissionCoordinator } from '../permissions/permission-coordinator';
import { createPreferencesStore } from '../preferences/preferences-store';
import { createNativeKeyValueStorage, createNativeSecretStorage } from '../storage/native-storage';
import { createToastStore } from '../ui/toast-store';
import {
  createDeferredOtaInitializer,
  createOtaUpdateCoordinator,
} from '../updates/ota-coordinator';
import type { AppRuntime, AppRuntimeOptions } from './runtime-types';

// 原因：启动期严格执行强模式环境变量校验，拒绝用硬编码默认值静默掩盖缺失或错误的环境配置
export function resolveStartupRuntimeEnv(
  sourceEnv: Record<string, string | undefined> = process.env,
): RuntimePublicEnv {
  const extraRaw: unknown = Constants.expoConfig?.extra?.runtimeEnv;
  if (extraRaw !== undefined && extraRaw !== null) {
    return parseRuntimePublicEnv(extraRaw);
  }
  return parseRuntimeEnv(sourceEnv);
}

export function createAppRuntime(options: AppRuntimeOptions): AppRuntime {
  const env = options.env ?? resolveStartupRuntimeEnv();
  const secretStorage = options.overrides?.secretStorage ?? createNativeSecretStorage();
  const keyValueStorage = options.overrides?.keyValueStorage ?? createNativeKeyValueStorage();
  // 原因：必须在任何启动期写入（如隐私同意、偏好落盘）之前采样沙盒既有状态，确保 iOS 重装检测不被首次隐私同意写入污染
  const hadSandboxStateAtBoot = hasPreExistingSandboxState(keyValueStorage);
  const consentAlreadyGranted = hasGrantedCurrentPrivacyConsent(options.identity, keyValueStorage);

  const observability = createObservabilitySuite({
    mirrorToConsole: options.observability?.mirrorLogsToConsole ?? env.appVariant === 'development',
    logger: options.observability?.logger,
    errorReporter: options.observability?.errorReporter,
    analytics: options.observability?.analytics,
  });

  const fallbackLanguage: SupportedLanguage = options.overrides?.initialDeviceLocale
    ? normalizeSupportedLanguage(options.overrides.initialDeviceLocale)
    : consentAlreadyGranted
      ? detectDeviceLanguage()
      : options.identity.defaultLanguage;

  const i18n = createAppI18n(fallbackLanguage, options.translations);
  const preferencesStore = createPreferencesStore({
    keyValueStorage,
    i18n,
    fallbackLanguage,
  });
  void i18n.changeLanguage(preferencesStore.getState().language);

  const queryClient = createAppQueryClient(options.overrides?.queryClientOptions);
  const queryPersistence = attachOptInQueryPersistence(queryClient, keyValueStorage);
  const authSessionStore = createAuthSessionStore({
    secretStorage,
    keyValueStorage,
    reconcileFreshInstall:
      options.overrides?.reconcileFreshInstall ?? options.overrides?.secretStorage === undefined,
    hadSandboxStateAtBoot,
  });
  authSessionStore.getState().onSessionCleared(() => {
    queryClient.clear();
    queryPersistence.clearPersistedSnapshots();
  });

  const otaCoordinator = createOtaUpdateCoordinator({
    enabled: options.ota?.enabled ?? false,
    driver: options.ota?.driver,
  });

  const privacyGateStore = createPrivacyGateStore({
    identity: options.identity,
    keyValueStorage,
    observability,
    deferredInitializers: [
      createDeferredOtaInitializer(otaCoordinator),
      ...(options.deferredInitializers ?? []),
    ],
  });
  privacyGateStore.getState().ensurePhase2Initialized();

  const devToolsStore = createDevToolsStore({
    env,
    keyValueStorage,
    secretStorage,
    queryClient,
    privacyGateStore,
    preferencesStore,
    logger: observability.logger,
  });
  const toastStore = createToastStore();

  const backendAdapter = options.backendAdapter ?? createDefaultBackendAdapter();
  const httpClient = createHttpClient({
    getBaseUrl: () => devToolsStore.getState().effectiveApiBaseUrl,
    backendAdapter,
    authSessionStore,
    logger: observability.logger,
    httpTransport: options.overrides?.httpTransport,
  });

  const connectivityStore = createConnectivityStore(
    options.overrides?.networkMonitor ?? createNativeNetworkMonitor(),
  );

  const { coordinator: permissionCoordinator, promptStore: permissionPromptStore } =
    createPermissionCoordinator({
      requirePermissionRationale: options.identity.compliance.requirePermissionRationale,
      overrideDriver: options.overrides?.permissionDriver,
      getBlockedStrings: () => ({
        title: i18n.t('permissions.blockedTitle'),
        description: i18n.t('permissions.blockedDescription'),
      }),
    });

  return {
    identity: options.identity,
    env,
    secretStorage,
    keyValueStorage,
    backendAdapter,
    httpClient,
    queryClient,
    connectivityStore,
    authSessionStore,
    permissionCoordinator,
    permissionPromptStore,
    vendors: options.vendors,
    capabilityOverrides: options.overrides?.capabilities,
    preferencesStore,
    privacyGateStore,
    devToolsStore,
    toastStore,
    otaCoordinator,
    logger: observability.logger,
    errorReporter: observability.errorReporter,
    analytics: observability.analytics,
    i18n,
    initialSystemColorScheme: options.overrides?.initialSystemColorScheme,
  };
}

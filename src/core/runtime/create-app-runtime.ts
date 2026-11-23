/**
 * @module core/runtime/create-app-runtime
 * 职责：依赖注入容器的装配逻辑——按依赖顺序创建存储、可观测性、i18n、鉴权、隐私门禁、网络、权限与 OTA，返回单一 AppRuntime 实例。
 * 边界：严禁静态导入 `src/core/capabilities/*`；严禁直接导入 `app.identity.ts`（须由上层注入）；装配顺序是行为的一部分，调整前先读注释。
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
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
import { createDrawerStore } from '../ui/drawer-store';
import { createToastStore } from '../ui/toast-store';
import {
  createDeferredOtaInitializer,
  createOtaUpdateCoordinator,
} from '../updates/ota-coordinator';
import { createVersionPolicyStore } from '../version-policy';
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

interface BootStorageStage {
  readonly secretStorage: AppRuntime['secretStorage'];
  readonly keyValueStorage: AppRuntime['keyValueStorage'];
  readonly hadSandboxStateAtBoot: boolean;
  readonly observability: ReturnType<typeof createObservabilitySuite>;
  readonly i18n: AppRuntime['i18n'];
  readonly preferencesStore: AppRuntime['preferencesStore'];
}

interface CoreServicesStage {
  readonly queryClient: AppRuntime['queryClient'];
  readonly authSessionStore: AppRuntime['authSessionStore'];
  readonly otaCoordinator: AppRuntime['otaCoordinator'];
  readonly versionPolicyStore: AppRuntime['versionPolicyStore'];
  readonly privacyGateStore: AppRuntime['privacyGateStore'];
  readonly devToolsStore: AppRuntime['devToolsStore'];
}

// 阶段 1：存储初始化 + 沙盒重装采样 + 隐私状态检查 + i18n 与偏好（必须在任何启动期写入前完成采样）
function bootStorageAndCompliance(
  options: AppRuntimeOptions,
  env: RuntimePublicEnv,
): BootStorageStage {
  const secretStorage = options.overrides?.secretStorage ?? createNativeSecretStorage();
  const keyValueStorage = options.overrides?.keyValueStorage ?? createNativeKeyValueStorage();
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

  return {
    secretStorage,
    keyValueStorage,
    hadSandboxStateAtBoot,
    observability,
    i18n,
    preferencesStore,
  };
}

// 阶段 2：缓存、会话鉴权、隐私双阶段门禁、OTA 与 DevTools（显式依赖阶段 1 的 hadSandboxStateAtBoot）
function bootCoreServices(
  options: AppRuntimeOptions,
  env: RuntimePublicEnv,
  boot: BootStorageStage,
): CoreServicesStage {
  const queryClient = createAppQueryClient(options.overrides?.queryClientOptions);
  const queryPersistence = attachOptInQueryPersistence(queryClient, boot.keyValueStorage, {
    buster: Constants.expoConfig?.version ?? '1.0.0',
    throttleTime: options.overrides?.queryPersistenceThrottleMs,
  });
  const authSessionStore = createAuthSessionStore({
    secretStorage: boot.secretStorage,
    keyValueStorage: boot.keyValueStorage,
    reconcileFreshInstall:
      options.overrides?.reconcileFreshInstall ?? options.overrides?.secretStorage === undefined,
    hadSandboxStateAtBoot: boot.hadSandboxStateAtBoot,
  });
  authSessionStore.getState().onSessionCleared(() => {
    queryClient.clear();
    queryPersistence.clearPersistedSnapshots();
  });

  const otaCoordinator = createOtaUpdateCoordinator({
    enabled: options.ota?.enabled ?? false,
    driver: options.ota?.driver,
  });

  const versionPolicyStore = createVersionPolicyStore({
    adapter: options.versionPolicy?.adapter,
    currentVersion:
      options.versionPolicy?.currentVersion ?? Constants.expoConfig?.version ?? '1.0.0',
    platform: options.versionPolicy?.platform ?? (Platform.OS === 'ios' ? 'ios' : 'android'),
    isConsentGranted: () => hasGrantedCurrentPrivacyConsent(options.identity, boot.keyValueStorage),
    getIdentifiers: options.versionPolicy?.getIdentifiers,
    timeoutMs: options.versionPolicy?.timeoutMs,
    allowBeforeConsent: options.versionPolicy?.allowBeforeConsent,
    fallbackUpdateUrl: options.versionPolicy?.fallbackUpdateUrl,
  });

  const privacyGateStore = createPrivacyGateStore({
    identity: options.identity,
    keyValueStorage: boot.keyValueStorage,
    observability: boot.observability,
    deferredInitializers: [
      createDeferredOtaInitializer(otaCoordinator),
      {
        id: 'core:version-policy',
        init: () => versionPolicyStore.getState().check(),
      },
      ...(options.deferredInitializers ?? []),
    ],
  });
  privacyGateStore.getState().ensurePhase2Initialized();

  const devToolsStore = createDevToolsStore({
    env,
    keyValueStorage: boot.keyValueStorage,
    secretStorage: boot.secretStorage,
    queryClient,
    privacyGateStore,
    preferencesStore: boot.preferencesStore,
    logger: boot.observability.logger,
  });

  return {
    queryClient,
    authSessionStore,
    otaCoordinator,
    versionPolicyStore,
    privacyGateStore,
    devToolsStore,
  };
}

// 阶段 3：网络客户端、连通性、权限协调器与 UI 状态容器（显式依赖阶段 1 与阶段 2）
function bootNetworkAndUiStores(
  options: AppRuntimeOptions,
  env: RuntimePublicEnv,
  boot: BootStorageStage,
  core: CoreServicesStage,
): AppRuntime {
  const toastStore = createToastStore();
  const drawerStore = createDrawerStore();

  const backendAdapter = options.backendAdapter ?? createDefaultBackendAdapter();
  const httpClient = createHttpClient({
    getBaseUrl: () => core.devToolsStore.getState().effectiveApiBaseUrl,
    backendAdapter,
    authSessionStore: core.authSessionStore,
    logger: boot.observability.logger,
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
        title: boot.i18n.t('permissions.blockedTitle'),
        description: boot.i18n.t('permissions.blockedDescription'),
      }),
    });

  return {
    identity: options.identity,
    env,
    secretStorage: boot.secretStorage,
    keyValueStorage: boot.keyValueStorage,
    backendAdapter,
    httpClient,
    queryClient: core.queryClient,
    connectivityStore,
    authSessionStore: core.authSessionStore,
    permissionCoordinator,
    permissionPromptStore,
    vendors: options.vendors,
    capabilityOverrides: options.overrides?.capabilities,
    preferencesStore: boot.preferencesStore,
    privacyGateStore: core.privacyGateStore,
    devToolsStore: core.devToolsStore,
    toastStore,
    drawerStore,
    otaCoordinator: core.otaCoordinator,
    versionPolicyStore: core.versionPolicyStore,
    logger: boot.observability.logger,
    errorReporter: boot.observability.errorReporter,
    analytics: boot.observability.analytics,
    i18n: boot.i18n,
    initialSystemColorScheme: options.overrides?.initialSystemColorScheme,
  };
}

export function createAppRuntime(options: AppRuntimeOptions): AppRuntime {
  const env = options.env ?? resolveStartupRuntimeEnv();
  const boot = bootStorageAndCompliance(options, env);
  const core = bootCoreServices(options, env, boot);
  return bootNetworkAndUiStores(options, env, boot, core);
}

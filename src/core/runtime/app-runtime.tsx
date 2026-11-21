/**
 * @module core/runtime/app-runtime
 * 职责：内核依赖注入容器与根 Provider 树装配中心，负责将存储、隐私门禁、鉴权、网络、观测、主题、国际化、权限与 OTA 串联成单一运行时实例。
 * 边界：严禁静态导入 `src/core/capabilities/*`（保证原生能力可物理删除）；严禁直接导入 `app.identity.ts`（须由上层 Route Shell 注入）。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import type { i18n as I18nInstance } from 'i18next';
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  type Metrics,
} from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import {
  createAuthSessionStore,
  hasPreExistingSandboxState,
  type AuthSessionState,
  type AuthSessionStore,
} from '../auth/auth-session-store';
import {
  createPrivacyGateStore,
  hasGrantedCurrentPrivacyConsent,
  type DeferredSdkInitializer,
  type PrivacyGateState,
  type PrivacyGateStore,
} from '../bootstrap/privacy-gate-store';
import { parseRuntimeEnv, parseRuntimePublicEnv } from '../config/env-schema';
import type { AppIdentity, RuntimePublicEnv } from '../config/types';
import type { DevToolsDrawerHostProps } from '../devtools/DevToolsDrawerHost';
import {
  createDevToolsStore,
  isDevToolsEnabled,
  type DevToolsState,
  type DevToolsStore,
} from '../devtools/devtools-store';
import { createAppI18n, detectDeviceLanguage, normalizeSupportedLanguage } from '../i18n/i18n';
import type { SupportedLanguage, TranslationBundleMap } from '../i18n/resources';
import { OfflineBanner } from '../network/OfflineBanner';
import { createDefaultBackendAdapter } from '../network/default-backend-adapter';
import { createHttpClient } from '../network/http-client';
import {
  createConnectivityStore,
  createNativeNetworkMonitor,
  type ConnectivityState,
  type ConnectivityStore,
  type NetworkMonitorDriver,
} from '../network/network-monitor';
import { createAppQueryClient, type CreateAppQueryClientOptions } from '../network/query-client';
import { attachOptInQueryPersistence } from '../network/query-persistence';
import type { BackendAdapter, HttpClient, HttpTransportDriver } from '../network/types';
import { AppErrorBoundary } from '../observability/AppErrorBoundary';
import {
  createObservabilitySuite,
  installGlobalErrorHandlers,
  type AnalyticsTracker,
  type ErrorReporter,
  type Logger,
} from '../observability/observability';
import { PermissionPromptHost } from '../permissions/PermissionPromptHost';
import {
  createPermissionCoordinator,
  type PermissionPromptStore,
} from '../permissions/permission-coordinator';
import type { PermissionCoordinator, PermissionOsDriver } from '../permissions/types';
import {
  createPreferencesStore,
  type PreferencesState,
  type PreferencesStore,
} from '../preferences/preferences-store';
import { createNativeKeyValueStorage, createNativeSecretStorage } from '../storage/native-storage';
import type { KeyValueStorageDriver, SecretStorageDriver } from '../storage/types';
import { AppThemeProvider } from '../theme/theme-context';
import type { ResolvedColorScheme } from '../theme/tokens';
import { ToastHost } from '../ui/ToastHost';
import { createToastStore, type ToastPayload, type ToastStore } from '../ui/toast-store';
import {
  createDeferredOtaInitializer,
  createOtaUpdateCoordinator,
  type OtaUpdateCoordinator,
  type OtaUpdateDriver,
} from '../updates/ota-coordinator';
import type { CommercialVendorAdapters } from '../vendors';

// 原因：允许各 Capability 模块通过 TypeScript Declaration Merging 自行注册强类型覆写契约，既消除 `as` 强转，又不违反 ESLint 禁止 core/runtime 静态导入 capabilities/* 的红线
export interface CapabilityOverrideMap {
  [capabilityName: string]: unknown;
}

export interface AppObservabilityOptions {
  logger?: Logger;
  errorReporter?: ErrorReporter;
  analytics?: AnalyticsTracker;
  mirrorLogsToConsole?: boolean;
}

export interface AppOtaOptions {
  enabled?: boolean;
  driver?: OtaUpdateDriver;
}

// 底层与测试覆写插槽（常规业务接入无需关注）
export interface AppRuntimeOverrides {
  secretStorage?: SecretStorageDriver;
  keyValueStorage?: KeyValueStorageDriver;
  reconcileFreshInstall?: boolean;
  httpTransport?: HttpTransportDriver;
  networkMonitor?: NetworkMonitorDriver;
  permissionDriver?: PermissionOsDriver;
  queryClientOptions?: CreateAppQueryClientOptions;
  initialSystemColorScheme?: ResolvedColorScheme;
  initialDeviceLocale?: string;
  capabilities?: CapabilityOverrideMap;
}

// 顶层仅暴露业务高频接入项，大幅降低新人接手时的 IDE 补全噪音
export interface AppRuntimeOptions {
  identity: AppIdentity;
  env?: RuntimePublicEnv;
  translations?: TranslationBundleMap;
  backendAdapter?: BackendAdapter;
  vendors?: Partial<CommercialVendorAdapters>;
  observability?: AppObservabilityOptions;
  deferredInitializers?: DeferredSdkInitializer[];
  ota?: AppOtaOptions;
  overrides?: AppRuntimeOverrides;
}

// 原因：内核运行时不静态导入任何 src/core/capabilities/* 子模块，确保派生应用物理删除任意能力文件夹后内核依然零修改编译通过
export interface AppRuntime {
  identity: AppIdentity;
  env: RuntimePublicEnv;
  secretStorage: SecretStorageDriver;
  keyValueStorage: KeyValueStorageDriver;
  backendAdapter: BackendAdapter;
  httpClient: HttpClient;
  queryClient: QueryClient;
  connectivityStore: ConnectivityStore;
  authSessionStore: AuthSessionStore;
  permissionCoordinator: PermissionCoordinator;
  permissionPromptStore: PermissionPromptStore;
  vendors?: Partial<CommercialVendorAdapters>;
  capabilityOverrides?: CapabilityOverrideMap;
  preferencesStore: PreferencesStore;
  privacyGateStore: PrivacyGateStore;
  devToolsStore: DevToolsStore;
  toastStore: ToastStore;
  otaCoordinator: OtaUpdateCoordinator;
  logger: Logger;
  errorReporter: ErrorReporter;
  analytics: AnalyticsTracker;
  i18n: I18nInstance;
  initialSystemColorScheme?: ResolvedColorScheme;
}

const FALLBACK_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

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

const AppRuntimeContext = createContext<AppRuntime | null>(null);

export interface AppRuntimeProviderProps {
  runtime: AppRuntime;
  children: React.ReactNode;
}

// 原因：仅在外层 isDevToolsEnabled(runtime.env) 为真时渲染；延迟 require 配合 metro.config.js 生产空桩替换，防止调试代码打入生产包
function NonProdDevToolsBoundary(props: DevToolsDrawerHostProps): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DevToolsDrawerHost } = require('../devtools/DevToolsDrawerHost') as {
    DevToolsDrawerHost: React.ComponentType<DevToolsDrawerHostProps>;
  };
  return <DevToolsDrawerHost {...props} />;
}

export function AppRuntimeProvider({
  runtime,
  children,
}: AppRuntimeProviderProps): React.JSX.Element {
  useEffect(() => {
    return installGlobalErrorHandlers({
      logger: runtime.logger,
      errorReporter: runtime.errorReporter,
    });
  }, [runtime.errorReporter, runtime.logger]);

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={runtime.queryClient}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics ?? FALLBACK_SAFE_AREA_METRICS}>
          <KeyboardProvider>
            <I18nextProvider i18n={runtime.i18n}>
              <AppThemeProvider
                themeSeed={runtime.identity.theme}
                preferencesStore={runtime.preferencesStore}
                systemColorSchemeOverride={runtime.initialSystemColorScheme}
              >
                <AppErrorBoundary logger={runtime.logger} errorReporter={runtime.errorReporter}>
                  <OfflineBanner
                    connectivityStore={runtime.connectivityStore}
                    privacyGateStore={runtime.privacyGateStore}
                  />
                  {children}
                  <PermissionPromptHost promptStore={runtime.permissionPromptStore} />
                  {isDevToolsEnabled(runtime.env) ? (
                    <NonProdDevToolsBoundary
                      env={runtime.env}
                      devToolsStore={runtime.devToolsStore}
                      authSessionStore={runtime.authSessionStore}
                      connectivityStore={runtime.connectivityStore}
                      logger={runtime.logger}
                    />
                  ) : null}
                  <ToastHost toastStore={runtime.toastStore} />
                </AppErrorBoundary>
              </AppThemeProvider>
            </I18nextProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </AppRuntimeContext.Provider>
  );
}

export function useAppRuntime(): AppRuntime {
  const context = useContext(AppRuntimeContext);
  if (!context) {
    throw new Error('useAppRuntime 必须在 AppRuntimeProvider 内部调用');
  }
  return context;
}

export function usePreferences<T>(selector: (state: PreferencesState) => T): T {
  const { preferencesStore } = useAppRuntime();
  return useStore(preferencesStore, selector);
}

export function usePrivacyGate<T>(selector: (state: PrivacyGateState) => T): T {
  const { privacyGateStore } = useAppRuntime();
  return useStore(privacyGateStore, selector);
}

export function useAuthSession<T>(selector: (state: AuthSessionState) => T): T {
  const { authSessionStore } = useAppRuntime();
  return useStore(authSessionStore, selector);
}

export function useConnectivity<T>(selector: (state: ConnectivityState) => T): T {
  const { connectivityStore } = useAppRuntime();
  return useStore(connectivityStore, selector);
}

export function useDevTools<T>(selector: (state: DevToolsState) => T): T {
  const { devToolsStore } = useAppRuntime();
  return useStore(devToolsStore, selector);
}

export function useToast(): {
  show: (payload: ToastPayload | string) => number;
  dismiss: (id?: number) => void;
} {
  const { toastStore } = useAppRuntime();
  return useMemo(
    () => ({
      show: (payload: ToastPayload | string) => toastStore.getState().show(payload),
      dismiss: (id?: number) => toastStore.getState().dismiss(id),
    }),
    [toastStore],
  );
}

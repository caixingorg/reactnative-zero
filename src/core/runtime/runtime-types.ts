/**
 * @module core/runtime/runtime-types
 * 职责：运行时容器的公共类型契约（选项、覆写插槽与 AppRuntime 形状），不含任何运行时逻辑。
 * 边界：严禁静态导入 `src/core/capabilities/*`；仅声明类型，由 `create-app-runtime.ts` 与 Provider 共用。
 */
import type { QueryClient } from '@tanstack/react-query';
import type { i18n as I18nInstance } from 'i18next';
import type { AuthSessionStore } from '../auth/auth-session-store';
import type { DeferredSdkInitializer, PrivacyGateStore } from '../bootstrap/privacy-gate-store';
import type { AppIdentity, RuntimePublicEnv } from '../config/types';
import type { DevToolsStore } from '../devtools/devtools-store';
import type { TranslationBundleMap } from '../i18n/resources';
import type { ConnectivityStore, NetworkMonitorDriver } from '../network/network-monitor';
import type { CreateAppQueryClientOptions } from '../network/query-client';
import type { BackendAdapter, HttpClient, HttpTransportDriver } from '../network/types';
import type { AnalyticsTracker, ErrorReporter, Logger } from '../observability/observability';
import type { PermissionPromptStore } from '../permissions/permission-coordinator';
import type { PermissionCoordinator, PermissionOsDriver } from '../permissions/types';
import type { PreferencesStore } from '../preferences/preferences-store';
import type { KeyValueStorageDriver, SecretStorageDriver } from '../storage/types';
import type { ResolvedColorScheme } from '../theme/tokens';
import type { DrawerStore } from '../ui/drawer-store';
import type { ToastStore } from '../ui/toast-store';
import type { OtaUpdateCoordinator, OtaUpdateDriver } from '../updates/ota-coordinator';
import type { CommercialVendorAdapters } from '../vendors';
import type {
  VersionPolicyAdapter,
  VersionPolicyPlatform,
  VersionPolicyStore,
} from '../version-policy';

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

export interface AppVersionPolicyOptions {
  adapter?: VersionPolicyAdapter;
  currentVersion?: string;
  platform?: VersionPolicyPlatform;
  fallbackUpdateUrl?: string;
  allowBeforeConsent?: boolean;
  timeoutMs?: number;
  getIdentifiers?: () => Record<string, string>;
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
  /** 离线查询持久化节流间隔（毫秒）；测试环境可覆写为 0 避免悬挂定时器 */
  queryPersistenceThrottleMs?: number;
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
  versionPolicy?: AppVersionPolicyOptions;
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
  drawerStore: DrawerStore;
  otaCoordinator: OtaUpdateCoordinator;
  versionPolicyStore: VersionPolicyStore;
  logger: Logger;
  errorReporter: ErrorReporter;
  analytics: AnalyticsTracker;
  i18n: I18nInstance;
  initialSystemColorScheme?: ResolvedColorScheme;
}

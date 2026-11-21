/**
 * @module core/runtime/app-runtime
 * 职责：运行时模块的稳定公共入口，聚合类型契约、容器装配、根 Provider 与选择器 Hook，对外接口与拆分前保持一致。
 * 边界：只做再导出；具体职责见 `runtime-types`、`create-app-runtime`、`AppRuntimeProvider`、`runtime-hooks`。
 */
export type {
  AppObservabilityOptions,
  AppOtaOptions,
  AppRuntime,
  AppRuntimeOptions,
  AppRuntimeOverrides,
  CapabilityOverrideMap,
} from './runtime-types';
export { createAppRuntime, resolveStartupRuntimeEnv } from './create-app-runtime';
export {
  AppRuntimeProvider,
  useAppRuntime,
  type AppRuntimeProviderProps,
} from './AppRuntimeProvider';
export {
  useAuthSession,
  useConnectivity,
  useDevTools,
  usePreferences,
  usePrivacyGate,
  useToast,
} from './runtime-hooks';

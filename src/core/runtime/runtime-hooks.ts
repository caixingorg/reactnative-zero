/**
 * @module core/runtime/runtime-hooks
 * 职责：基于 AppRuntime 各 store 的选择器 Hook（偏好、隐私门禁、鉴权、连通性、DevTools、Toast）。
 * 边界：仅做 store 到 React 的薄封装，不持有状态；通过 `useAppRuntime` 取得容器。
 */
import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { AuthSessionState } from '../auth/auth-session-store';
import type { PrivacyGateState } from '../bootstrap/privacy-gate-store';
import type { DevToolsState } from '../devtools/devtools-store';
import type { ConnectivityState } from '../network/network-monitor';
import type { PreferencesState } from '../preferences/preferences-store';
import type { ToastPayload } from '../ui/toast-store';
import { useAppRuntime } from './AppRuntimeProvider';

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

export function useDrawer(): { open: () => void; close: () => void; toggle: () => void } {
  const { drawerStore } = useAppRuntime();
  return useMemo(
    () => ({
      open: () => drawerStore.getState().open(),
      close: () => drawerStore.getState().close(),
      toggle: () => drawerStore.getState().toggle(),
    }),
    [drawerStore],
  );
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

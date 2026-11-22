import type NetInfoModule from '@react-native-community/netinfo';
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface NetworkMonitorDriver {
  getInitialOnline(): boolean;
  subscribe(listener: (isOnline: boolean) => void): () => void;
}

export interface ControllableNetworkMonitor extends NetworkMonitorDriver {
  setOnline(isOnline: boolean): void;
}

export function createControllableNetworkMonitor(initialOnline = true): ControllableNetworkMonitor {
  let online = initialOnline;
  const listeners = new Set<(isOnline: boolean) => void>();

  return {
    getInitialOnline: () => online,
    subscribe(listener: (isOnline: boolean) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOnline(nextOnline: boolean): void {
      online = nextOnline;
      for (const listener of listeners) {
        listener(nextOnline);
      }
    },
  };
}

// 原因：遵循 ADR-0004，延迟在二阶段激活订阅时才按需加载原生 NetInfo 模块，模块导入期零设备状态读取副作用
export function createNativeNetworkMonitor(): NetworkMonitorDriver {
  return {
    getInitialOnline: () => true,
    subscribe(listener: (isOnline: boolean) => void): () => void {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const NetInfo = require('@react-native-community/netinfo') as {
          default?: typeof NetInfoModule;
        } & typeof NetInfoModule;
        const client = NetInfo.default ?? NetInfo;
        return client.addEventListener((state) => {
          // 原因：@react-native-community/netinfo 默认探测 clients3.google.com/generate_204，国内网络下会超时误报 isInternetReachable=false；
          // 因此以系统原生链路连接状态 isConnected 作为离线横幅依据，真实业务接口超时由 HttpClient 独立兜底提示
          const connected = state.isConnected !== false;
          listener(connected);
        });
      } catch {
        return () => {};
      }
    },
  };
}

export interface ConnectivityState {
  isOnline: boolean;
  startMonitoring: () => () => void;
}

export type ConnectivityStore = StoreApi<ConnectivityState>;

export function createConnectivityStore(monitor: NetworkMonitorDriver): ConnectivityStore {
  let activeUnsubscribe: (() => void) | null = null;

  return createStore<ConnectivityState>((set) => ({
    isOnline: monitor.getInitialOnline(),
    startMonitoring: () => {
      if (activeUnsubscribe) {
        return activeUnsubscribe;
      }
      const unsub = monitor.subscribe((online) => {
        set({ isOnline: online });
      });
      activeUnsubscribe = () => {
        unsub();
        activeUnsubscribe = null;
      };
      return activeUnsubscribe;
    },
  }));
}

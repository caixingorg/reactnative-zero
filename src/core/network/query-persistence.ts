/**
 * @module core/network/query-persistence
 * 职责：基于 TanStack 官方 `@tanstack/react-query-persist-client` 与 `@tanstack/query-sync-storage-persister` 对接 MMKV，提供显式 Opt-In 的首屏离线快照持久化（含写入节流、maxAge 过期淘汰、应用版本 buster 失效与登出原子清空）。
 * 边界：仅持久化 `meta.persistOffline === true` 的非敏感公开查询；严禁用于含身份凭证或个人敏感 PII 的接口。
 */
import { hydrate, type QueryClient } from '@tanstack/react-query';
import { persistQueryClientSave, type PersistedClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { KeyValueStorageDriver } from '../storage/types';

export const OFFLINE_QUERY_SNAPSHOT_KEY = 'query.offline_snapshots_v1';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_THROTTLE_MS = 1000;

export interface OfflinePersistQueryMeta {
  persistOffline?: boolean;
  maxOfflinePages?: number;
}

export interface AttachOptInQueryPersistenceOptions {
  /** 离线快照最大存活时间（毫秒），默认 24 小时 */
  maxAge?: number;
  /** 缓存失效版本标识（通常绑定应用版本号），变更时自动丢弃旧结构快照 */
  buster?: string;
  /** 写入 MMKV 节流间隔（毫秒），默认 1000ms；设为 0 时同步立即写入（便于测试） */
  throttleTime?: number;
}

export interface OptInQueryPersistenceHandle {
  clearPersistedSnapshots: () => void;
  unsubscribe: () => void;
  restoreReady: Promise<void>;
}

interface InfiniteDataShape {
  pages: unknown[];
  pageParams: unknown[];
}

function isInfiniteDataShape(value: unknown): value is InfiniteDataShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as InfiniteDataShape).pages) &&
    Array.isArray((value as InfiniteDataShape).pageParams)
  );
}

function boundOfflinePayload(data: unknown, maxOfflinePages: number): unknown {
  if (!isInfiniteDataShape(data)) {
    return data;
  }
  const safeLimit = Math.max(1, maxOfflinePages);
  if (data.pages.length <= safeLimit) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.slice(0, safeLimit),
    pageParams: data.pageParams.slice(0, safeLimit),
  };
}

function boundPersistedClient(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.map((dehydratedQuery) => {
    const meta = dehydratedQuery.meta as OfflinePersistQueryMeta | undefined;
    const boundedData = boundOfflinePayload(dehydratedQuery.state.data, meta?.maxOfflinePages ?? 1);
    if (boundedData === dehydratedQuery.state.data) {
      return dehydratedQuery;
    }
    return {
      ...dehydratedQuery,
      state: {
        ...dehydratedQuery.state,
        data: boundedData,
      },
    };
  });

  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries,
    },
  };
}

// 原因：改用 TanStack 官方持久化引擎并适配 MMKV 同步存储，自动具备写入节流、maxAge 过期淘汰与发版 buster 爆破，
// 同时保留仅 Opt-In 非敏感查询落盘、无限列表页数裁剪及登出后阻断旧定时器回写的安全边界
export function attachOptInQueryPersistence(
  queryClient: QueryClient,
  keyValueStorage: KeyValueStorageDriver,
  options: AttachOptInQueryPersistenceOptions = {},
): OptInQueryPersistenceHandle {
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE_MS;
  const buster = options.buster ?? '1.0.0';
  const throttleTime = options.throttleTime ?? DEFAULT_THROTTLE_MS;

  let clearedSinceLastWrite = false;
  let lastSavedSignature = '';

  const mmkvAdapter = {
    getItem: (key: string): string | null => keyValueStorage.getString(key) ?? null,
    setItem: (key: string, value: string): void => {
      if (clearedSinceLastWrite) {
        return;
      }
      keyValueStorage.setString(key, value);
    },
    removeItem: (key: string): void => {
      keyValueStorage.deleteKey(key);
    },
  };

  const basePersister = createSyncStoragePersister({
    storage: mmkvAdapter,
    key: OFFLINE_QUERY_SNAPSHOT_KEY,
    throttleTime,
    serialize: (client) => JSON.stringify(boundPersistedClient(client)),
  });

  // 原因：createSyncStoragePersister 内部 throttle(0) 仍走 setTimeout 宏任务；当显式设置 throttleTime=0 时直写存储，保证同步测试无悬挂定时器
  const persister =
    throttleTime === 0
      ? {
          ...basePersister,
          persistClient: (client: PersistedClient): void => {
            try {
              mmkvAdapter.setItem(
                OFFLINE_QUERY_SNAPSHOT_KEY,
                JSON.stringify(boundPersistedClient(client)),
              );
            } catch {
              // Ignore non-serializable payloads
            }
          },
        }
      : basePersister;

  const dehydrateOptions = {
    shouldDehydrateMutation: () => false,
    shouldDehydrateQuery: (query: {
      meta?: Record<string, unknown>;
      state: { status: string; data: unknown; dataUpdatedAt: number };
    }): boolean => {
      const meta = query.meta as OfflinePersistQueryMeta | undefined;
      return (
        Boolean(meta?.persistOffline) &&
        query.state.status === 'success' &&
        query.state.data !== undefined &&
        query.state.dataUpdatedAt > 0
      );
    },
  };

  // 原因：MMKV 读取完全同步，在启动阶段同步校验 buster/maxAge 并执行 TanStack hydrate，可确保冷启动首帧即展示缓存而无异步骨架闪烁
  try {
    const restored = basePersister.restoreClient() as PersistedClient | undefined;
    if (restored && typeof restored === 'object' && restored.clientState) {
      const isExpired =
        typeof restored.timestamp === 'number' && Date.now() - restored.timestamp > maxAge;
      const isBusted = restored.buster !== buster;
      if (isExpired || isBusted) {
        keyValueStorage.deleteKey(OFFLINE_QUERY_SNAPSHOT_KEY);
      } else {
        hydrate(queryClient, restored.clientState);
      }
    } else if (restored !== undefined) {
      keyValueStorage.deleteKey(OFFLINE_QUERY_SNAPSHOT_KEY);
    }
  } catch {
    keyValueStorage.deleteKey(OFFLINE_QUERY_SNAPSHOT_KEY);
  }

  const restoreReady = Promise.resolve();

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') {
      return;
    }
    const query = event.query;
    const meta = query.meta as OfflinePersistQueryMeta | undefined;
    if (
      !meta?.persistOffline ||
      query.state.status !== 'success' ||
      query.state.data === undefined ||
      query.state.dataUpdatedAt <= 0
    ) {
      return;
    }

    const signature = `${query.queryHash}:${query.state.dataUpdatedAt}:${query.state.dataUpdateCount}`;
    if (signature === lastSavedSignature) {
      return;
    }
    lastSavedSignature = signature;
    clearedSinceLastWrite = false;

    void persistQueryClientSave({
      queryClient,
      persister,
      buster,
      dehydrateOptions,
    });
  });

  return {
    clearPersistedSnapshots: () => {
      clearedSinceLastWrite = true;
      lastSavedSignature = '';
      void persister.removeClient();
    },
    unsubscribe,
    restoreReady,
  };
}

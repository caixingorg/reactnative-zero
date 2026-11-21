/**
 * @module core/network/query-persistence
 * 职责：为 TanStack Query 提供显式 Opt-In 的首屏离线快照持久化（基于 MMKV），并在登出时同步清理。
 * 边界：仅持久化 `meta.persistOffline === true` 的非敏感公开查询；严禁用于含身份凭证或个人敏感 PII 的接口。
 */
import type { QueryClient } from '@tanstack/react-query';
import type { KeyValueStorageDriver } from '../storage/types';

export const OFFLINE_QUERY_SNAPSHOT_KEY = 'query.offline_snapshots_v1';

export interface OfflinePersistQueryMeta {
  persistOffline?: boolean;
  maxOfflinePages?: number;
}

interface PersistedQueryRecord {
  queryHash: string;
  queryKey: readonly unknown[];
  data: unknown;
  dataUpdatedAt: number;
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

// 原因：仅对显式声明 meta.persistOffline === true 的非敏感公开查询落盘首屏快照（严禁用于含身份证/银行卡/私密会话等敏感 PII 接口）；同时按 dataUpdatedAt 去重并裁剪无限列表页数，杜绝每次 fetching 状态变更重复全量 JSON.stringify 阻塞主线程
export function attachOptInQueryPersistence(
  queryClient: QueryClient,
  keyValueStorage: KeyValueStorageDriver,
): { clearPersistedSnapshots: () => void } {
  const persistedByHash = new Map<string, PersistedQueryRecord>();

  const rawInitial = keyValueStorage.getString(OFFLINE_QUERY_SNAPSHOT_KEY);
  if (rawInitial) {
    try {
      const records = JSON.parse(rawInitial) as PersistedQueryRecord[];
      if (Array.isArray(records)) {
        for (const entry of records) {
          if (
            typeof entry.queryHash === 'string' &&
            Array.isArray(entry.queryKey) &&
            entry.data !== undefined
          ) {
            persistedByHash.set(entry.queryHash, entry);
            queryClient.setQueryData(entry.queryKey, entry.data, {
              updatedAt: entry.dataUpdatedAt,
            });
          }
        }
      }
    } catch {
      keyValueStorage.deleteKey(OFFLINE_QUERY_SNAPSHOT_KEY);
    }
  }

  queryClient.getQueryCache().subscribe((event) => {
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

    const previous = persistedByHash.get(query.queryHash);
    if (previous && previous.dataUpdatedAt === query.state.dataUpdatedAt) {
      return;
    }

    const boundedData = boundOfflinePayload(query.state.data, meta.maxOfflinePages ?? 1);
    persistedByHash.set(query.queryHash, {
      queryHash: query.queryHash,
      queryKey: query.queryKey,
      data: boundedData,
      dataUpdatedAt: query.state.dataUpdatedAt,
    });

    try {
      keyValueStorage.setString(
        OFFLINE_QUERY_SNAPSHOT_KEY,
        JSON.stringify(Array.from(persistedByHash.values())),
      );
    } catch {
      // Ignore non-serializable payloads
    }
  });

  return {
    clearPersistedSnapshots: () => {
      persistedByHash.clear();
      keyValueStorage.deleteKey(OFFLINE_QUERY_SNAPSHOT_KEY);
    },
  };
}

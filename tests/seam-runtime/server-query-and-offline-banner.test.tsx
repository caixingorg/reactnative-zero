import { QueryClient } from '@tanstack/react-query';
import React from 'react';
import { render, screen, userEvent, act } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { createControllableNetworkMonitor } from '@/core/network/network-monitor';
import {
  attachOptInQueryPersistence,
  OFFLINE_QUERY_SNAPSHOT_KEY,
} from '@/core/network/query-persistence';
import type { RawHttpRequest, RawHttpResponse } from '@/core/network/types';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { FeedDetailScreen, HomeStarterScreen } from '@/features/home';
import { appTranslationResources } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

const readyIdentity = {
  ...appIdentity,
  compliance: {
    ...appIdentity.compliance,
    requirePrivacyConsent: false,
  },
};

describe('Seam 1: TanStack Query Starter Slice (pagination, retry, detail, cache purge) & OfflineBanner', () => {
  it('loads paginated feed items, recovers from request failure on retry, renders item detail with Shared Layer component, and purges cache on sign-out', async () => {
    const user = userEvent.setup();
    const secretStorage = createMemorySecretStorage();
    await secretStorage.setSecret('auth.access_token', 'valid-token');
    await secretStorage.setSecret('auth.refresh_token', 'valid-refresh');

    let shouldFailFirstAttempt = true;

    const httpTransport = jest.fn(async (req: RawHttpRequest): Promise<RawHttpResponse> => {
      if (req.url.endsWith('/feed')) {
        if (shouldFailFirstAttempt) {
          return {
            status: 500,
            headers: {},
            data: { code: 50001, message: '网关暂时繁忙', data: null },
          };
        }

        const page = Number(req.params?.page ?? 1);
        if (page === 1) {
          return {
            status: 200,
            headers: {},
            data: {
              code: 0,
              data: {
                items: [
                  {
                    id: 'item-1',
                    title: '季度架构评审纪要',
                    summary: '确定四层单向依赖规范',
                    category: '架构治理',
                    status: 'published',
                    coverUrl: 'https://img.example.com/1.png',
                    publishedAt: '2026-11-17',
                  },
                ],
                nextPage: 2,
              },
            },
          };
        }

        return {
          status: 200,
          headers: {},
          data: {
            code: 0,
            data: {
              items: [
                {
                  id: 'item-2',
                  title: '移动端隐私合规检查单',
                  summary: '覆盖双端敏感权限声明剥离',
                  category: '安全合规',
                  status: 'review',
                  coverUrl: 'https://img.example.com/2.png',
                  publishedAt: '2026-11-18',
                },
              ],
              nextPage: null,
            },
          },
        };
      }

      if (req.url.endsWith('/feed/item-1')) {
        return {
          status: 200,
          headers: {},
          data: {
            code: 0,
            data: {
              id: 'item-1',
              title: '季度架构评审纪要',
              summary: '确定四层单向依赖规范',
              content: '所有新增业务切片必须独立收敛于 features 目录，严禁侵入 Template Core。',
              category: '架构治理',
              status: 'published',
              coverUrl: 'https://img.example.com/1.png',
              publishedAt: '2026-11-17',
            },
          },
        };
      }

      return { status: 404, headers: {}, data: { code: 404, message: 'Not Found' } };
    });

    const sharedKv = createMemoryKeyValueStorage();
    const runtime = createTestRuntime({
      identity: readyIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage,
        keyValueStorage: sharedKv,
        initialDeviceLocale: 'zh-CN',
        httpTransport,
      },
    });
    await runtime.authSessionStore.getState().hydrateSession();

    const selectedIds: string[] = [];
    const listMount = await render(
      <AppRuntimeProvider runtime={runtime}>
        <HomeStarterScreen onSelectItem={(id) => selectedIds.push(id)} />
      </AppRuntimeProvider>,
    );

    // 1. Initial failure renders retry state
    expect(await screen.findByText('列表加载失败')).toBeTruthy();

    // 2. Retry succeeds, renders Page 1, and FlashList onEndReached automatically loads Page 2
    shouldFailFirstAttempt = false;
    await user.press(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('季度架构评审纪要')).toBeTruthy();
    expect(screen.getByText('已发布')).toBeTruthy();
    expect(await screen.findByText('移动端隐私合规检查单')).toBeTruthy();
    expect(await screen.findByText('已加载全部内容')).toBeTruthy();

    // 4. Tap item triggers selection callback, and background refetch failure keeps loaded items visible
    await user.press(screen.getByText('季度架构评审纪要'));
    expect(selectedIds).toEqual(['item-1']);

    shouldFailFirstAttempt = true;
    await act(async () => {
      await runtime.queryClient.refetchQueries({ queryKey: ['feed', 'list'] });
    });
    expect(await screen.findByText(/网关暂时繁忙/)).toBeTruthy();
    expect(screen.getByText('季度架构评审纪要')).toBeTruthy();

    await listMount.unmount();

    // 5. Render FeedDetailScreen for item-1
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <FeedDetailScreen itemId="item-1" />
      </AppRuntimeProvider>,
    );
    expect(
      await screen.findByText(
        '所有新增业务切片必须独立收敛于 features 目录，严禁侵入 Template Core。',
      ),
    ).toBeTruthy();

    // 6. Opt-in offline query snapshot bounds InfiniteData to first page, avoids redundant writes on failed refetch, and wipes atomically on sign-out
    const snapshotBeforeLogout = sharedKv.getString('query.offline_snapshots_v1') ?? '';
    expect(snapshotBeforeLogout).toContain('季度架构评审纪要');
    expect(snapshotBeforeLogout).not.toContain('移动端隐私合规检查单');
    expect(runtime.queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);
    await runtime.authSessionStore.getState().clearSession();
    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(sharedKv.getString('query.offline_snapshots_v1')).toBeUndefined();
  });

  it('shows non-blocking top offline banner when disconnected and hides it immediately upon reconnection', async () => {
    const networkMonitor = createControllableNetworkMonitor(true);

    const runtime = createTestRuntime({
      identity: readyIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
        networkMonitor,
        httpTransport: async () => ({
          status: 200,
          headers: {},
          data: { code: 0, data: { items: [], nextPage: null } },
        }),
      },
    });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <HomeStarterScreen />
      </AppRuntimeProvider>,
    );

    expect(screen.queryByText('当前网络不可用，请检查网络设置')).toBeNull();

    await act(async () => {
      networkMonitor.setOnline(false);
    });
    expect(screen.getByText('当前网络不可用，请检查网络设置')).toBeTruthy();

    await act(async () => {
      networkMonitor.setOnline(true);
    });
    expect(screen.queryByText('当前网络不可用，请检查网络设置')).toBeNull();
  });

  it('sanitizes raw technical network/gateway error details into friendly localized copy on HomeStarterScreen', async () => {
    const runtime = createTestRuntime({
      identity: readyIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        initialDeviceLocale: 'zh-CN',
        httpTransport: async () => {
          throw new Error('connect ECONNREFUSED 10.0.4.18:8080 (upstream internal gateway)');
        },
      },
    });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <HomeStarterScreen />
      </AppRuntimeProvider>,
    );

    expect(await screen.findByText('列表加载失败')).toBeTruthy();
    expect(screen.getByText('服务请求暂时异常，请检查网络或稍后重试')).toBeTruthy();
    expect(screen.queryByText(/10\.0\.4\.18/)).toBeNull();
  });

  it('invalidates persisted offline snapshots when buster version changes or maxAge expires, and throttles rapid writes', async () => {
    const kv = createMemoryKeyValueStorage();
    const setStringSpy = jest.spyOn(kv, 'setString');

    // 1. Throttled persistence: rapid bursts coalesce into a single storage write
    const makeClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    const clientA = makeClient();
    const persistenceA = attachOptInQueryPersistence(clientA, kv, {
      buster: '1.0.0',
      maxAge: 60_000,
      throttleTime: 50,
    });
    clientA.setQueryDefaults(['public', 'feed'], { meta: { persistOffline: true } });
    clientA.setQueryData(['public', 'feed'], { title: 'v1-first' });
    clientA.setQueryData(['public', 'feed'], { title: 'v1-second' });
    expect(setStringSpy).toHaveBeenCalledTimes(0);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(setStringSpy).toHaveBeenCalledTimes(1);
    expect(kv.getString(OFFLINE_QUERY_SNAPSHOT_KEY)).toContain('v1-second');
    persistenceA.unsubscribe();

    // 2. Same buster & fresh timestamp restores cached data into a new QueryClient
    const clientB = makeClient();
    const persistenceB = attachOptInQueryPersistence(clientB, kv, {
      buster: '1.0.0',
      maxAge: 60_000,
      throttleTime: 0,
    });
    await persistenceB.restoreReady;
    expect(clientB.getQueryData(['public', 'feed'])).toEqual({ title: 'v1-second' });
    persistenceB.unsubscribe();

    // 3. Mismatched buster (app version upgrade) discards incompatible snapshot
    const clientC = makeClient();
    const persistenceC = attachOptInQueryPersistence(clientC, kv, {
      buster: '2.0.0',
      maxAge: 60_000,
      throttleTime: 0,
    });
    await persistenceC.restoreReady;
    expect(clientC.getQueryData(['public', 'feed'])).toBeUndefined();
    expect(kv.getString(OFFLINE_QUERY_SNAPSHOT_KEY)).toBeUndefined();
    persistenceC.unsubscribe();

    // 4. Expired snapshot (older than maxAge) is discarded on restore
    const expiredPayload = JSON.stringify({
      timestamp: Date.now() - 120_000,
      buster: '2.0.0',
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ['public', 'feed'],
            queryHash: '["public","feed"]',
            state: {
              status: 'success',
              data: { title: 'stale' },
              dataUpdatedAt: Date.now() - 120_000,
            },
          },
        ],
      },
    });
    kv.setString(OFFLINE_QUERY_SNAPSHOT_KEY, expiredPayload);
    const clientD = makeClient();
    const persistenceD = attachOptInQueryPersistence(clientD, kv, {
      buster: '2.0.0',
      maxAge: 60_000,
      throttleTime: 0,
    });
    await persistenceD.restoreReady;
    expect(clientD.getQueryData(['public', 'feed'])).toBeUndefined();
    persistenceD.unsubscribe();
  });
});

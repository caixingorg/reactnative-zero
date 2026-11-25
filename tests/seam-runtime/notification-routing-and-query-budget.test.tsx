import { QueryClient } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { NotificationNavigationBridge } from '@/app/_layout';
import {
  sanitizeNotificationRoute,
  type NotificationTapPayload,
} from '@/core/capabilities/notifications';
import {
  attachOptInQueryPersistence,
  OFFLINE_QUERY_SNAPSHOT_KEY,
} from '@/core/network/query-persistence';
import { AppRuntimeProvider } from '@/core/runtime';
import { createMemoryKeyValueStorage } from '@/core/storage/memory-storage';
import { createTestRuntime } from '../helpers/create-test-runtime';

const mockPush = jest.fn();
const mockRouter = { push: mockPush, replace: jest.fn() };

jest.mock('expo-router', () => ({
  Stack: Object.assign(({ children }: { children?: React.ReactNode }) => children ?? null, {
    Screen: () => null,
    Protected: ({ children }: { children?: React.ReactNode }) => children ?? null,
  }),
  useRouter: () => mockRouter,
  useSegments: () => ['(tabs)'],
}));

describe('Notification tap routing & offline query hydration byte budget (Tickets 05 & 06)', () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it('sanitizes notification routes against external URLs, protocol-relative paths, and production-blocked routes', () => {
    expect(sanitizeNotificationRoute('/settings', { appVariant: 'production' })).toBe('/settings');
    expect(sanitizeNotificationRoute('/feed/42?tab=comments', { appVariant: 'production' })).toBe(
      '/feed/42?tab=comments',
    );
    expect(sanitizeNotificationRoute('https://evil.com/phish')).toBeNull();
    expect(sanitizeNotificationRoute('//evil.com/phish')).toBeNull();
    expect(sanitizeNotificationRoute('enterprisern://checkout')).toBeNull();
    expect(sanitizeNotificationRoute('/developer-lab', { appVariant: 'production' })).toBeNull();
    expect(sanitizeNotificationRoute('/developer-lab', { appVariant: 'development' })).toBe(
      '/developer-lab',
    );
  });

  it('navigates immediately on foreground tap when ready, and queues cold-start tap until Privacy Gate + auth pass', async () => {
    let listener: ((payload: NotificationTapPayload) => void) | null = null;
    const unsubscribe = jest.fn();

    const runtime = createTestRuntime({
      env: {
        appVariant: 'production',
        appChannel: 'official',
        apiBaseUrl: 'https://api.acme.cn',
        privacyPolicyUrl: 'https://legal.acme.cn/privacy',
        userAgreementUrl: 'https://legal.acme.cn/terms',
        enableMockGateway: false,
        enableDevTools: false,
      },
      overrides: {
        capabilities: {
          notifications: {
            scheduleLocalNotification: jest.fn().mockResolvedValue({ notificationId: 'n1' }),
            setBadgeCount: jest.fn().mockResolvedValue(true),
            getDevicePushToken: jest.fn().mockResolvedValue('tok'),
            subscribeNotificationResponses: (handler) => {
              listener = handler;
              return unsubscribe;
            },
            getInitialNotificationResponse: async () => ({
              notificationId: 'cold-1',
              route: '/settings',
              data: { route: '/settings' },
            }),
          },
        },
      },
    });

    const { unmount } = await render(
      <AppRuntimeProvider runtime={runtime}>
        <NotificationNavigationBridge />
      </AppRuntimeProvider>,
    );

    // Cold-start tap received before privacy consent & login -> must NOT navigate yet
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockPush).not.toHaveBeenCalled();

    // Grant privacy consent + establish auth session -> queued cold-start route executes once
    await act(async () => {
      runtime.privacyGateStore.getState().acceptPrivacyPolicy();
      await runtime.authSessionStore.getState().establishSession({
        tokens: { accessToken: 'tok', refreshToken: 'ref' },
        user: { id: 'u-1', username: 'tester', displayName: 'Tester' },
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/settings');
    });

    // Malicious & production-blocked foreground taps are silently rejected
    await act(async () => {
      listener?.({ route: 'https://evil.com', data: {} });
      listener?.({ route: '/developer-lab', data: {} });
    });
    expect(mockPush).toHaveBeenCalledTimes(1);

    // Valid foreground tap navigates immediately
    await act(async () => {
      listener?.({ route: '/search', data: { route: '/search' } });
    });
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith('/search');

    await act(async () => {
      await unmount();
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('bounds persisted offline query snapshots to maxTotalBytes on write and discards oversized snapshots on cold-start restore', async () => {
    const storage = createMemoryKeyValueStorage();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0 } },
    });

    const handle = attachOptInQueryPersistence(queryClient, storage, {
      buster: '1.0.0',
      throttleTime: 0,
      maxTotalBytes: 1200,
    });

    await queryClient.fetchQuery({
      queryKey: ['older-feed'],
      queryFn: async () => ({ text: 'a'.repeat(500) }),
      meta: { persistOffline: true },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await queryClient.fetchQuery({
      queryKey: ['newer-feed'],
      queryFn: async () => ({ text: 'b'.repeat(500) }),
      meta: { persistOffline: true },
    });

    await waitFor(() => {
      const saved = storage.getString(OFFLINE_QUERY_SNAPSHOT_KEY);
      expect(saved).toBeDefined();
      expect(Buffer.byteLength(saved!, 'utf8')).toBeLessThanOrEqual(1200);
      expect(saved).toContain('newer-feed');
      expect(saved).not.toContain('older-feed');
    });

    handle.unsubscribe();
    queryClient.clear();

    // Oversized pre-existing snapshot is cleared and skipped during cold-start restore
    storage.setString(OFFLINE_QUERY_SNAPSHOT_KEY, JSON.stringify({ huge: 'x'.repeat(5000) }));
    const coldClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0 } },
    });
    const coldHandle = attachOptInQueryPersistence(coldClient, storage, {
      buster: '1.0.0',
      throttleTime: 0,
      maxTotalBytes: 1200,
    });

    expect(storage.getString(OFFLINE_QUERY_SNAPSHOT_KEY)).toBeUndefined();
    expect(coldClient.getQueryCache().getAll()).toHaveLength(0);
    coldHandle.unsubscribe();
    coldClient.clear();
  });
});

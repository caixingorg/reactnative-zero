import React from 'react';
import { Text } from 'react-native';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import type { RawHttpRequest, RawHttpResponse } from '@/core/network/types';
import { AppRuntimeProvider, useAuthSession } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { LoginScreen } from '@/features/auth';
import { SettingsScreen } from '@/features/settings';
import { appTranslationResources, createMockHttpTransport } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

const noPrivacyGateIdentity = {
  ...appIdentity,
  compliance: {
    ...appIdentity.compliance,
    requirePrivacyConsent: false,
  },
};

describe('Seam 1: Pluggable Backend Adapter, single-flight 401 refresh lock, and Auth Starter Slice', () => {
  it('validates login inputs live on change, works out-of-the-box with demo gateway, stores tokens only in secret storage, restores on restart, and clears on sign-out', async () => {
    const user = userEvent.setup();
    const secretStorage = createMemorySecretStorage();
    const keyValueStorage = createMemoryKeyValueStorage();
    const mockTransport = createMockHttpTransport();

    const firstRuntime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage,
        keyValueStorage,
        initialDeviceLocale: 'zh-CN',
        httpTransport: mockTransport,
      },
    });

    await firstRuntime.authSessionStore.getState().hydrateSession();

    function AuthShellHarness(): React.JSX.Element {
      const status = useAuthSession((s) => s.status);
      if (status !== 'authenticated') {
        return <LoginScreen />;
      }
      return (
        <>
          <Text>已进入受保护主界面</Text>
          <SettingsScreen />
        </>
      );
    }

    const firstMount = await render(
      <AppRuntimeProvider runtime={firstRuntime}>
        <AuthShellHarness />
      </AppRuntimeProvider>,
    );

    // 1. Live instant validation while typing (before pressing submit)
    const usernameInput = screen.getByPlaceholderText('请输入账号');
    await user.type(usernameInput, 'ab');
    expect(await screen.findByText('请输入至少 3 位账号')).toBeTruthy();

    // 2. Submit wrong password to verify Backend Adapter business error surface
    await user.clear(usernameInput);
    await user.type(usernameInput, 'admin');
    const passwordInput = screen.getByPlaceholderText('请输入密码');
    await user.type(passwordInput, 'wrongpass');
    await user.press(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('测试账号为 admin，密码为 password123')).toBeTruthy();

    // 3. Submit valid demo credentials
    await user.clear(passwordInput);
    await user.type(passwordInput, 'password123');
    await user.press(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('已进入受保护主界面')).toBeTruthy();

    // Verify strict dual-storage boundary: tokens ONLY in secretStorage, NEVER in keyValueStorage
    expect(await secretStorage.getSecret('auth.access_token')).toBe('mock-access-token');
    expect(await secretStorage.getSecret('auth.refresh_token')).toBe('mock-refresh-token');
    expect(keyValueStorage.getString('auth.access_token')).toBeUndefined();
    expect(keyValueStorage.getString('auth.refresh_token')).toBeUndefined();

    await firstMount.unmount();

    // 4. Cold-start hydration restores authenticated session from secretStorage
    const secondRuntime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage,
        keyValueStorage,
        initialDeviceLocale: 'zh-CN',
        httpTransport: mockTransport,
      },
    });
    await secondRuntime.authSessionStore.getState().hydrateSession();
    expect(secondRuntime.authSessionStore.getState().status).toBe('authenticated');

    await render(
      <AppRuntimeProvider runtime={secondRuntime}>
        <AuthShellHarness />
      </AppRuntimeProvider>,
    );
    expect(screen.getByText('已进入受保护主界面')).toBeTruthy();

    // 5. Atomic sign-out via ConfirmDialog wipes secretStorage and returns to LoginScreen
    await user.press(screen.getByRole('button', { name: '退出登录' }));
    expect(await screen.findByText('确认退出登录？')).toBeTruthy();
    const confirmButtons = screen.getAllByRole('button', { name: '退出登录' });
    const confirmButton = confirmButtons.at(-1);
    expect(confirmButton).toBeDefined();
    await user.press(confirmButton!);
    expect(await screen.findByRole('button', { name: '登录' })).toBeTruthy();
    expect(await secretStorage.getSecret('auth.access_token')).toBeNull();
    expect(await secretStorage.getSecret('auth.refresh_token')).toBeNull();
  });

  it('executes token refresh ONLY ONCE across 4 concurrent 401s AND a late-arriving stale-token 401', async () => {
    const secretStorage = createMemorySecretStorage();
    const keyValueStorage = createMemoryKeyValueStorage();
    await secretStorage.setSecret('auth.access_token', 'expired-access-token');
    await secretStorage.setSecret('auth.refresh_token', 'valid-refresh-token');

    let refreshCallCount = 0;

    const httpTransport = jest.fn(async (req: RawHttpRequest): Promise<RawHttpResponse> => {
      if (req.url.endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return {
          status: 200,
          headers: {},
          data: {
            code: 0,
            message: 'ok',
            data: {
              accessToken: 'fresh-access-token-v2',
              refreshToken: 'fresh-refresh-token-v2',
            },
          },
        };
      }

      // Simulate slow request #5 returning 401 AFTER refresh has already completed
      if (
        req.url.endsWith('/orders/slow-5') &&
        req.headers?.Authorization === 'Bearer expired-access-token'
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const authHeader = req.headers?.Authorization ?? req.headers?.authorization;
      if (authHeader !== 'Bearer fresh-access-token-v2') {
        return {
          status: 401,
          headers: {},
          data: {
            code: 40101,
            message: 'Access token expired',
            data: null,
          },
        };
      }

      const itemId = req.url.split('/').pop();
      return {
        status: 200,
        headers: {},
        data: {
          code: 0,
          message: 'ok',
          data: { itemId, verifiedWith: authHeader },
        },
      };
    });

    const runtime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage,
        keyValueStorage,
        httpTransport,
      },
    });
    await runtime.authSessionStore.getState().hydrateSession();

    const results = await Promise.all([
      runtime.httpClient.get<{ itemId: string; verifiedWith: string }>('/orders/1'),
      runtime.httpClient.get<{ itemId: string; verifiedWith: string }>('/orders/2'),
      runtime.httpClient.get<{ itemId: string; verifiedWith: string }>('/orders/3'),
      runtime.httpClient.get<{ itemId: string; verifiedWith: string }>('/orders/4'),
      runtime.httpClient.get<{ itemId: string; verifiedWith: string }>('/orders/slow-5'),
    ]);

    expect(refreshCallCount).toBe(1);
    expect(results.map((r) => r.itemId)).toEqual(['1', '2', '3', '4', 'slow-5']);
    expect(results.every((r) => r.verifiedWith === 'Bearer fresh-access-token-v2')).toBe(true);
    expect(await secretStorage.getSecret('auth.access_token')).toBe('fresh-access-token-v2');
    expect(keyValueStorage.getString('auth.access_token')).toBeUndefined();
  });

  it('atomically clears hardware credentials and transitions session to unauthenticated when token refresh fails', async () => {
    const secretStorage = createMemorySecretStorage();
    const keyValueStorage = createMemoryKeyValueStorage();
    await secretStorage.setSecret('auth.access_token', 'expired-access');
    await secretStorage.setSecret('auth.refresh_token', 'revoked-refresh');

    const httpTransport = jest.fn(async (req: RawHttpRequest): Promise<RawHttpResponse> => {
      if (req.url.endsWith('/auth/refresh')) {
        return {
          status: 401,
          headers: {},
          data: { code: 40102, message: 'Refresh token revoked', data: null },
        };
      }
      return {
        status: 401,
        headers: {},
        data: { code: 40101, message: 'Access token expired', data: null },
      };
    });

    const runtime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage,
        keyValueStorage,
        httpTransport,
      },
    });
    await runtime.authSessionStore.getState().hydrateSession();
    expect(runtime.authSessionStore.getState().status).toBe('authenticated');

    await expect(runtime.httpClient.get('/profile')).rejects.toMatchObject({
      kind: 'unauthorized',
    });

    await waitFor(async () => {
      expect(runtime.authSessionStore.getState().status).toBe('unauthenticated');
      expect(await secretStorage.getSecret('auth.access_token')).toBeNull();
      expect(await secretStorage.getSecret('auth.refresh_token')).toBeNull();
    });
  });

  it('recovers from Keystore read errors (purging offline snapshots), migrates in-place app upgrades without logging users out, wipes iOS reinstall Keychain orphans, and preserves session on transient refresh errors', async () => {
    // 1. Keystore read exception falls back to unauthenticated AND purges hydrated offline snapshots (N6)
    const brokenKv = createMemoryKeyValueStorage();
    brokenKv.setBoolean('app.install_session_marker', true);
    brokenKv.setString(
      'query.offline_snapshots_v1',
      JSON.stringify([
        {
          queryHash: '["feed","list"]',
          queryKey: ['feed', 'list'],
          data: { secretItem: 'previous-user-feed' },
          dataUpdatedAt: Date.now(),
        },
      ]),
    );
    const brokenSecretStorage = {
      getSecret: async () => {
        throw new Error('Android Keystore key invalidated');
      },
      setSecret: async () => {},
      deleteSecret: async () => {},
    };
    const brokenRuntime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage: brokenSecretStorage,
        keyValueStorage: brokenKv,
      },
    });
    expect(brokenRuntime.queryClient.getQueryData(['feed', 'list'])).toBeDefined();
    await brokenRuntime.authSessionStore.getState().hydrateSession();
    expect(brokenRuntime.authSessionStore.getState().status).toBe('unauthenticated');
    expect(brokenRuntime.queryClient.getQueryData(['feed', 'list'])).toBeUndefined();
    expect(brokenKv.getString('query.offline_snapshots_v1')).toBeUndefined();

    // 2. In-place upgrade from older app version (no install marker yet, but sandbox has privacy consent / preferences) -> preserves session & backfills marker (N7)
    const upgradedSecrets = createMemorySecretStorage();
    await upgradedSecrets.setSecret('auth.access_token', 'existing-user-access');
    await upgradedSecrets.setSecret('auth.refresh_token', 'existing-user-refresh');
    const upgradedSandboxKv = createMemoryKeyValueStorage();
    upgradedSandboxKv.setString('compliance.accepted_privacy_version', '1.0.0');

    const upgradedRuntime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage: upgradedSecrets,
        keyValueStorage: upgradedSandboxKv,
        reconcileFreshInstall: true,
      },
    });
    await upgradedRuntime.authSessionStore.getState().hydrateSession();
    expect(upgradedRuntime.authSessionStore.getState().status).toBe('authenticated');
    expect(upgradedSandboxKv.getBoolean('app.install_session_marker')).toBe(true);
    expect(await upgradedSecrets.getSecret('auth.access_token')).toBe('existing-user-access');

    // 任意既有业务键值（无需在 auth 模块白名单中登记）均应识别为老版本覆盖升级，不误擦除既有会话
    const arbitraryLegacySecrets = createMemorySecretStorage();
    await arbitraryLegacySecrets.setSecret('auth.access_token', 'legacy-biz-access');
    await arbitraryLegacySecrets.setSecret('auth.refresh_token', 'legacy-biz-refresh');
    const arbitraryLegacyKv = createMemoryKeyValueStorage();
    expect(arbitraryLegacyKv.isEmpty()).toBe(true);
    arbitraryLegacyKv.setString('feature.onboarding_seen', 'true');

    expect(arbitraryLegacyKv.isEmpty()).toBe(false);
    const arbitraryLegacyRuntime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage: arbitraryLegacySecrets,
        keyValueStorage: arbitraryLegacyKv,
        reconcileFreshInstall: true,
      },
    });
    await arbitraryLegacyRuntime.authSessionStore.getState().hydrateSession();
    expect(arbitraryLegacyRuntime.authSessionStore.getState().status).toBe('authenticated');
    expect(arbitraryLegacyKv.getBoolean('app.install_session_marker')).toBe(true);
    expect(await arbitraryLegacySecrets.getSecret('auth.access_token')).toBe('legacy-biz-access');

    // 3. iOS reinstall scenario WITH requirePrivacyConsent=true:
    // User accepts privacy policy (writing ACCEPTED_PRIVACY_VERSION_KEY into KV) BEFORE hydrateSession runs;
    // orphaned Keychain secrets MUST STILL be wiped instead of being misclassified as an in-place upgrade.
    const orphanedKeychain = createMemorySecretStorage();
    await orphanedKeychain.setSecret('auth.access_token', 'stale-ios-keychain-token');
    await orphanedKeychain.setSecret('auth.refresh_token', 'stale-ios-refresh-token');
    const freshReinstalledKv = createMemoryKeyValueStorage();
    let reinstallClearedCount = 0;

    const reinstalledRuntime = createTestRuntime({
      identity: appIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage: orphanedKeychain,
        keyValueStorage: freshReinstalledKv,
        reconcileFreshInstall: true,
      },
    });
    reinstalledRuntime.authSessionStore.getState().onSessionCleared(() => {
      reinstallClearedCount += 1;
    });
    expect(reinstalledRuntime.privacyGateStore.getState().phase).toBe('awaiting-consent');
    reinstalledRuntime.privacyGateStore.getState().acceptPrivacyPolicy();
    expect(freshReinstalledKv.getString('compliance.accepted_privacy_version')).toBe(
      appIdentity.privacyPolicyVersion,
    );
    await reinstalledRuntime.authSessionStore.getState().hydrateSession();
    expect(reinstalledRuntime.authSessionStore.getState().status).toBe('unauthenticated');
    expect(await orphanedKeychain.getSecret('auth.access_token')).toBeNull();
    expect(reinstallClearedCount).toBe(1);

    // 3. Transient network/502 error during refresh preserves session & refresh_token
    const netSecrets = createMemorySecretStorage();
    await netSecrets.setSecret('auth.access_token', 'expired-access');
    await netSecrets.setSecret('auth.refresh_token', 'good-refresh-token');

    const netRuntime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage: netSecrets,
        keyValueStorage: createMemoryKeyValueStorage(),
        httpTransport: async (req) => {
          if (req.url.endsWith('/auth/refresh')) {
            return { status: 502, headers: {}, data: 'Bad Gateway' };
          }
          return {
            status: 401,
            headers: {},
            data: { code: 40101, message: 'Token expired', data: null },
          };
        },
      },
    });
    await netRuntime.authSessionStore.getState().hydrateSession();

    await expect(netRuntime.httpClient.get('/orders')).rejects.toMatchObject({
      kind: 'network',
    });
    expect(netRuntime.authSessionStore.getState().status).toBe('authenticated');
    expect(await netSecrets.getSecret('auth.refresh_token')).toBe('good-refresh-token');
  });

  async function setupRefreshScenario(refreshResponse: RawHttpResponse) {
    const secretStorage = createMemorySecretStorage();
    await secretStorage.setSecret('auth.access_token', 'expired-access');
    await secretStorage.setSecret('auth.refresh_token', 'some-refresh-token');
    let refreshCalls = 0;
    const runtime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage,
        keyValueStorage: createMemoryKeyValueStorage(),
        httpTransport: async (req) => {
          if (req.url.endsWith('/auth/refresh')) {
            refreshCalls += 1;
            return refreshResponse;
          }
          return {
            status: 401,
            headers: {},
            data: { code: 40101, message: 'Token expired', data: null },
          };
        },
      },
    });
    await runtime.authSessionStore.getState().hydrateSession();
    expect(runtime.authSessionStore.getState().status).toBe('authenticated');
    return { runtime, secretStorage, getRefreshCalls: () => refreshCalls };
  }

  it.each([
    [
      'HTTP 400 invalid_grant',
      { status: 400, headers: {}, data: { error: 'invalid_grant' } } satisfies RawHttpResponse,
    ],
    [
      'HTTP 200 business error envelope',
      {
        status: 200,
        headers: {},
        data: { code: 40102, message: 'Refresh token revoked', data: null },
      } satisfies RawHttpResponse,
    ],
    [
      'HTTP 403 envelope',
      {
        status: 403,
        headers: {},
        data: { code: 40300, message: 'Forbidden', data: null },
      } satisfies RawHttpResponse,
    ],
  ])(
    'clears the session once and rejects all concurrent waiters as unauthorized when refresh returns %s',
    async (_label, refreshResponse) => {
      const { runtime, secretStorage, getRefreshCalls } =
        await setupRefreshScenario(refreshResponse);

      const results = await Promise.allSettled([
        runtime.httpClient.get('/a'),
        runtime.httpClient.get('/b'),
        runtime.httpClient.get('/c'),
      ]);

      expect(getRefreshCalls()).toBe(1);
      for (const result of results) {
        expect(result.status).toBe('rejected');
        expect((result as PromiseRejectedResult).reason).toMatchObject({ kind: 'unauthorized' });
      }
      expect(runtime.authSessionStore.getState().status).toBe('unauthenticated');
      expect(await secretStorage.getSecret('auth.access_token')).toBeNull();
      expect(await secretStorage.getSecret('auth.refresh_token')).toBeNull();
    },
  );

  it.each<[string, RawHttpResponse, string]>([
    ['HTTP 503', { status: 503, headers: {}, data: 'Service Unavailable' }, 'network'],
    [
      'HTTP 429',
      { status: 429, headers: {}, data: { code: 42900, message: 'Too many requests', data: null } },
      'business',
    ],
    ['HTTP 408', { status: 408, headers: {}, data: 'Request Timeout' }, 'network'],
    [
      'HTTP 404 from a misrouted gateway',
      { status: 404, headers: {}, data: { code: 40400, message: 'Not Found', data: null } },
      'business',
    ],
    ['HTTP 422', { status: 422, headers: {}, data: 'Unprocessable' }, 'network'],
    [
      'HTTP 200 wrapping a server fault envelope (50000)',
      {
        status: 200,
        headers: {},
        data: { code: 50000, message: 'Redis cluster temporarily busy', data: null },
      },
      'business',
    ],
    [
      'HTTP 200 wrapping a rate-limit envelope (42900)',
      {
        status: 200,
        headers: {},
        data: { code: 42900, message: 'Refresh rate limited', data: null },
      },
      'business',
    ],
  ])(
    'preserves the session and refresh token when refresh returns transient %s',
    async (_label, refreshResponse, expectedKind) => {
      const { runtime, secretStorage, getRefreshCalls } =
        await setupRefreshScenario(refreshResponse);

      await expect(runtime.httpClient.get('/orders')).rejects.toMatchObject({
        kind: expectedKind,
      });

      expect(getRefreshCalls()).toBe(1);
      expect(runtime.authSessionStore.getState().status).toBe('authenticated');
      expect(await secretStorage.getSecret('auth.refresh_token')).toBe('some-refresh-token');
    },
  );

  it('preserves the session when the refresh request gets no response at all', async () => {
    const secretStorage = createMemorySecretStorage();
    await secretStorage.setSecret('auth.access_token', 'expired-access');
    await secretStorage.setSecret('auth.refresh_token', 'some-refresh-token');
    const runtime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      overrides: {
        secretStorage,
        keyValueStorage: createMemoryKeyValueStorage(),
        httpTransport: async (req) => {
          if (req.url.endsWith('/auth/refresh')) {
            throw new Error('Network request failed');
          }
          return {
            status: 401,
            headers: {},
            data: { code: 40101, message: 'Token expired', data: null },
          };
        },
      },
    });
    await runtime.authSessionStore.getState().hydrateSession();

    await expect(runtime.httpClient.get('/orders')).rejects.not.toMatchObject({
      kind: 'unauthorized',
    });
    expect(runtime.authSessionStore.getState().status).toBe('authenticated');
    expect(await secretStorage.getSecret('auth.refresh_token')).toBe('some-refresh-token');
  });

  it('allows checking and unchecking privacy consent before login and only persists consent on submit', async () => {
    const user = userEvent.setup();
    const secretStorage = createMemorySecretStorage();
    const keyValueStorage = createMemoryKeyValueStorage();
    const onOpenPrivacyPolicy = jest.fn();
    const onOpenUserAgreement = jest.fn();
    const runtime = createTestRuntime({
      identity: appIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage,
        keyValueStorage,
        initialDeviceLocale: 'zh-CN',
        httpTransport: createMockHttpTransport(),
      },
    });
    await runtime.authSessionStore.getState().hydrateSession();
    expect(runtime.privacyGateStore.getState().phase).toBe('awaiting-consent');

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <LoginScreen
          onOpenPrivacyPolicy={onOpenPrivacyPolicy}
          onOpenUserAgreement={onOpenUserAgreement}
        />
      </AppRuntimeProvider>,
    );

    const checkbox = screen.getByTestId('login-privacy-checkbox');
    expect(checkbox.props.accessibilityState?.checked).toBe(false);

    // 1. Clicking legal links invokes their detail callbacks
    await user.press(screen.getByText('《用户协议》'));
    await user.press(screen.getByText('《隐私政策》'));
    expect(onOpenUserAgreement).toHaveBeenCalledTimes(1);
    expect(onOpenPrivacyPolicy).toHaveBeenCalledTimes(1);

    // 2. Checking then unchecking works cleanly without prematurely persisting privacy consent
    await user.press(checkbox);
    expect(screen.getByTestId('login-privacy-checkbox').props.accessibilityState?.checked).toBe(
      true,
    );
    expect(runtime.privacyGateStore.getState().phase).toBe('awaiting-consent');

    await user.press(checkbox);
    expect(screen.getByTestId('login-privacy-checkbox').props.accessibilityState?.checked).toBe(
      false,
    );

    // 3. Submitting while unchecked blocks login and surfaces consent prompt
    await user.type(screen.getByPlaceholderText('请输入账号'), 'admin');
    await user.type(screen.getByPlaceholderText('请输入密码'), 'password123');
    await user.press(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('请先阅读并勾选同意《用户协议》与《隐私政策》')).toBeTruthy();
    expect(runtime.privacyGateStore.getState().phase).toBe('awaiting-consent');
    expect(runtime.authSessionStore.getState().status).toBe('unauthenticated');

    // 4. Checking consent and submitting persists privacy acceptance and establishes session
    await user.press(checkbox);
    await user.press(screen.getByRole('button', { name: '登录' }));
    expect(runtime.privacyGateStore.getState().phase).toBe('ready');
    expect(runtime.authSessionStore.getState().status).toBe('authenticated');
  });

  it('supports end-to-end account lifecycle: register, forgot-password reset, change password, and account deletion', async () => {
    const user = userEvent.setup();
    const secretStorage = createMemorySecretStorage();
    const keyValueStorage = createMemoryKeyValueStorage();
    const runtime = createTestRuntime({
      identity: noPrivacyGateIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage,
        keyValueStorage,
        initialDeviceLocale: 'zh-CN',
        httpTransport: createMockHttpTransport(),
      },
    });
    await runtime.authSessionStore.getState().hydrateSession();

    // 1. Register new account via mock gateway
    await runtime.httpClient.post(
      '/auth/register',
      { username: '13900139000', password: 'initPassword1', displayName: '新成员' },
      { skipAuth: true },
    );

    // 2. Forgot password reset on LoginScreen and login with the new password
    const loginMount = await render(
      <AppRuntimeProvider runtime={runtime}>
        <LoginScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('login-forgot-password'));
    await user.type(screen.getByTestId('reset-username-input'), '13900139000');
    await user.type(screen.getByTestId('reset-password-input'), 'resetPass2');
    await user.press(screen.getByTestId('reset-password-submit'));

    await user.type(screen.getByPlaceholderText('请输入密码'), 'resetPass2');
    await user.press(screen.getByRole('button', { name: '登录' }));
    expect(runtime.authSessionStore.getState().status).toBe('authenticated');
    expect(runtime.authSessionStore.getState().user?.username).toBe('13900139000');
    await loginMount.unmount();

    // 3. Change password and delete account in SettingsScreen
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SettingsScreen />
      </AppRuntimeProvider>,
    );
    await user.press(screen.getByTestId('settings-change-password-btn'));
    await user.type(screen.getByTestId('settings-current-password-input'), 'resetPass2');
    await user.type(screen.getByTestId('settings-new-password-input'), 'finalPass3');
    await user.press(screen.getByTestId('settings-change-password-submit'));

    await user.press(screen.getByTestId('settings-delete-account-btn'));
    await user.press(screen.getByText('确认注销'));
    expect(runtime.authSessionStore.getState().status).toBe('unauthenticated');
    expect(await secretStorage.getSecret('auth.access_token')).toBeNull();
  });
});

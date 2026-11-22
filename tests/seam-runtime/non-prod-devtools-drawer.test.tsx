import path from 'node:path';
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { PrivacyGateView } from '@/core/bootstrap/PrivacyGateView';
import type { RawHttpRequest, RawHttpResponse } from '@/core/network/types';
import { AppRuntimeProvider, useAppRuntime, usePrivacyGate } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { SettingsScreen } from '@/features/settings';
import { appTranslationResources } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

// 原因：与生产 Route Shell 保持一致，在路由层显式守卫隐私门禁，使 DevTools 重置隐私同意后切换至 PrivacyGateView
function TestPrivacyGateShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { identity, env, privacyGateStore } = useAppRuntime();
  const isPrivacyReady = usePrivacyGate((state) => state.phase === 'ready');

  if (!isPrivacyReady) {
    return <PrivacyGateView identity={identity} env={env} privacyGateStore={privacyGateStore} />;
  }

  return <>{children}</>;
}

describe('Seam 1: Non-production In-App DevTools drawer & strict production stripping', () => {
  it('overrides and restores API Base URL across restarts, simulates 401 refresh, clears non-secret caches, and resets Privacy Gate in non-production variants', async () => {
    const user = userEvent.setup();
    const sharedKv = createMemoryKeyValueStorage();
    const sharedSecrets = createMemorySecretStorage();
    await sharedSecrets.setSecret('auth.access_token', 'valid-initial-token');
    await sharedSecrets.setSecret('auth.refresh_token', 'valid-refresh-token');
    sharedKv.setString('demo.cached_filter', 'active-orders');

    const requestedUrls: string[] = [];
    let refreshCount = 0;

    const httpTransport = jest.fn(async (req: RawHttpRequest): Promise<RawHttpResponse> => {
      requestedUrls.push(req.url);
      if (req.url.endsWith('/auth/refresh')) {
        refreshCount += 1;
        return {
          status: 200,
          headers: {},
          data: {
            code: 0,
            data: {
              accessToken: 'recovered-token-after-sim',
              refreshToken: 'valid-refresh-token',
            },
          },
        };
      }

      const authHeader = req.headers?.Authorization ?? '';
      if (authHeader.includes('simulated-expired')) {
        return {
          status: 401,
          headers: {},
          data: { code: 40101, message: 'Simulated token expired', data: null },
        };
      }

      return {
        status: 200,
        headers: {},
        data: { code: 0, data: { ok: true } },
      };
    });

    const consentIdentity = {
      ...appIdentity,
      privacyPolicyVersion: '1.0.0',
      compliance: {
        requirePrivacyConsent: true,
        requirePermissionRationale: true,
      },
    };
    sharedKv.setString('compliance.accepted_privacy_version', '1.0.0');

    const devRuntime = createTestRuntime({
      identity: consentIdentity,
      env: {
        ...TEST_RUNTIME_ENV,
        appVariant: 'staging',
      },
      translations: appTranslationResources,
      overrides: {
        secretStorage: sharedSecrets,
        keyValueStorage: sharedKv,
        initialDeviceLocale: 'zh-CN',
        httpTransport,
      },
    });
    await devRuntime.authSessionStore.getState().hydrateSession();
    devRuntime.logger.info('Boot diagnostic entry for DevTools');

    const firstMount = await render(
      <AppRuntimeProvider runtime={devRuntime}>
        <TestPrivacyGateShell>
          <SettingsScreen />
        </TestPrivacyGateShell>
      </AppRuntimeProvider>,
    );

    // 1. Open DevTools drawer from SettingsScreen in staging variant & inspect diagnostics
    await user.press(screen.getByRole('button', { name: '打开开发者调试面板' }));
    expect(await screen.findByText('开发者调试面板')).toBeTruthy();
    expect(screen.getAllByText(/STAGING/).length).toBeGreaterThan(0);
    expect(screen.getByText(/已持有加密凭证/)).toBeTruthy();
    expect(screen.queryByText(/valid-initial-token/)).toBeNull();
    expect(screen.getByText(/在线/)).toBeTruthy();
    expect(screen.getByText(/Boot diagnostic entry for DevTools/)).toBeTruthy();

    // 2. Override API Base URL at runtime -> takes effect immediately
    const urlInput = screen.getByPlaceholderText('输入覆盖接口地址 (https://...)');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://qa-override.example.com');
    await user.press(screen.getByRole('button', { name: '应用接口地址' }));

    await devRuntime.httpClient.get('/health');
    expect(requestedUrls).toContain('https://qa-override.example.com/health');

    // 3. Simulate access-token expiration -> next request triggers single-flight 401 refresh
    await user.press(screen.getByRole('button', { name: '模拟访问凭证过期' }));
    await devRuntime.httpClient.get('/orders');
    expect(refreshCount).toBe(1);
    expect(await sharedSecrets.getSecret('auth.access_token')).toBe('recovered-token-after-sim');

    await firstMount.unmount();

    // 4. Cold restart preserves the overridden API Base URL in staging
    const restartedRuntime = createTestRuntime({
      identity: consentIdentity,
      env: {
        ...TEST_RUNTIME_ENV,
        appVariant: 'staging',
      },
      translations: appTranslationResources,
      overrides: {
        secretStorage: sharedSecrets,
        keyValueStorage: sharedKv,
        initialDeviceLocale: 'zh-CN',
        httpTransport,
      },
    });
    expect(restartedRuntime.httpClient.getBaseUrl()).toBe('https://qa-override.example.com');

    await render(
      <AppRuntimeProvider runtime={restartedRuntime}>
        <TestPrivacyGateShell>
          <SettingsScreen />
        </TestPrivacyGateShell>
      </AppRuntimeProvider>,
    );

    // 5. Restore default API Base URL and clear non-secret local caches (preserving SecretStorage)
    await user.press(screen.getByRole('button', { name: '打开开发者调试面板' }));
    await user.press(await screen.findByRole('button', { name: '恢复默认接口地址' }));
    expect(restartedRuntime.httpClient.getBaseUrl()).toBe(TEST_RUNTIME_ENV.apiBaseUrl);

    sharedKv.setString('demo.cached_filter', 'stale-cache');
    await user.press(screen.getByRole('button', { name: '清空本地缓存' }));
    expect(sharedKv.getString('demo.cached_filter')).toBeUndefined();
    expect(sharedKv.getString('compliance.accepted_privacy_version')).toBe('1.0.0');
    expect(await sharedSecrets.getSecret('auth.access_token')).toBe('recovered-token-after-sim');

    // 6. Reset Privacy Gate immediately deletes consent version and returns user to Privacy Gate screen
    await user.press(screen.getByRole('button', { name: '重置隐私合规门禁' }));
    expect(sharedKv.getString('compliance.accepted_privacy_version')).toBeUndefined();
    expect(await screen.findByText('个人信息保护指引')).toBeTruthy();
  });

  it('completely strips DevTools UI and ignores any stored API URL override in production variant', async () => {
    const sharedKv = createMemoryKeyValueStorage();
    sharedKv.setString('devtools.api_base_url_override', 'https://malicious-override.example.com');

    const prodRuntime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          requirePrivacyConsent: false,
          requirePermissionRationale: false,
        },
      },
      env: {
        ...TEST_RUNTIME_ENV,
        appVariant: 'production',
        apiBaseUrl: 'https://prod-api.example.com',
      },
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: sharedKv,
        initialDeviceLocale: 'zh-CN',
      },
    });

    expect(prodRuntime.httpClient.getBaseUrl()).toBe('https://prod-api.example.com');
    prodRuntime.devToolsStore.getState().openDrawer();
    expect(prodRuntime.devToolsStore.getState().drawerOpen).toBe(false);

    await render(
      <AppRuntimeProvider runtime={prodRuntime}>
        <SettingsScreen />
      </AppRuntimeProvider>,
    );

    expect(screen.queryByRole('button', { name: '打开开发者调试面板' })).toBeNull();
    expect(screen.queryByText('开发者调试面板')).toBeNull();
  });

  it('physically redirects DevToolsOverlay and mock-http-transport to zero-payload stubs via metro.config.js ONLY when APP_VARIANT=production', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const metroConfig = require('@root/metro.config.js') as {
      resolver: {
        resolveRequest: (
          ctx: {
            resolveRequest: (_c: unknown, mod: string) => { type: string; filePath: string };
          },
          moduleName: string,
          platform: string,
        ) => { type: string; filePath: string };
      };
    };

    const devToolsRealPath = path.resolve(repoRoot, 'src/core/devtools/DevToolsOverlay.tsx');
    const devToolsStubPath = path.resolve(repoRoot, 'src/core/devtools/DevToolsOverlay.prod.tsx');
    const devToolsStoreRealPath = path.resolve(repoRoot, 'src/core/devtools/devtools-store.ts');
    const devToolsStoreStubPath = path.resolve(
      repoRoot,
      'src/core/devtools/devtools-store.prod.ts',
    );
    const demoRealPath = path.resolve(repoRoot, 'src/shared/mock/mock-http-transport.ts');
    const demoStubPath = path.resolve(repoRoot, 'src/shared/mock/mock-http-transport.prod.ts');

    const fakeContext = {
      resolveRequest: (_ctx: unknown, moduleName: string) => ({
        type: 'sourceFile',
        filePath: moduleName.includes('DevToolsOverlay')
          ? devToolsRealPath
          : moduleName.includes('devtools-store')
            ? devToolsStoreRealPath
            : demoRealPath,
      }),
    };

    const prevVariant = process.env.APP_VARIANT;
    try {
      process.env.APP_VARIANT = 'staging';
      expect(
        metroConfig.resolver.resolveRequest(fakeContext, '../devtools/DevToolsOverlay', 'ios')
          .filePath,
      ).toBe(devToolsRealPath);
      expect(
        metroConfig.resolver.resolveRequest(fakeContext, '../devtools/devtools-store', 'ios')
          .filePath,
      ).toBe(devToolsStoreRealPath);

      process.env.APP_VARIANT = 'production';
      expect(
        metroConfig.resolver.resolveRequest(fakeContext, '../devtools/DevToolsOverlay', 'ios')
          .filePath,
      ).toBe(devToolsStubPath);
      expect(
        metroConfig.resolver.resolveRequest(fakeContext, '../devtools/devtools-store', 'ios')
          .filePath,
      ).toBe(devToolsStoreStubPath);
      expect(
        metroConfig.resolver.resolveRequest(fakeContext, './mock/mock-http-transport', 'android')
          .filePath,
      ).toBe(demoStubPath);
    } finally {
      if (prevVariant === undefined) {
        delete process.env.APP_VARIANT;
      } else {
        process.env.APP_VARIANT = prevVariant;
      }
    }
  });

  it('throws immediately during production bundling if a required .prod stub file is missing instead of silently shipping debug code', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const metroConfig = require('@root/metro.config.js') as {
      resolver: {
        resolveRequest: (
          ctx: {
            resolveRequest: (_c: unknown, mod: string) => { type: string; filePath: string };
          },
          moduleName: string,
          platform: string,
        ) => { type: string; filePath: string };
      };
    };

    const devToolsRealPath = path.resolve(repoRoot, 'src/core/devtools/DevToolsOverlay.tsx');
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    const prevVariant = process.env.APP_VARIANT;
    try {
      process.env.APP_VARIANT = 'production';
      expect(() =>
        metroConfig.resolver.resolveRequest(
          {
            resolveRequest: () => ({ type: 'sourceFile', filePath: devToolsRealPath }),
          },
          '../devtools/DevToolsOverlay',
          'ios',
        ),
      ).toThrow(/Missing production stub file/);
    } finally {
      if (prevVariant === undefined) {
        delete process.env.APP_VARIANT;
      } else {
        process.env.APP_VARIANT = prevVariant;
      }
      existsSpy.mockRestore();
    }
  });
});

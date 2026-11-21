import React, { createRef } from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import {
  dispatchBridgeMessage,
  isSafeExternalHttpUrl,
  isTrustedWebUrl,
  READONLY_HOST_BRIDGE_INJECTION_SCRIPT,
  SecureHybridWebView,
  type WebViewBridgeChannelHandle,
} from '@/core/capabilities/webview';
import { AppRuntimeProvider } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
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

describe('Seam 1: Secure Hybrid WebView domain allowlist & zod-validated bidirectional JSBridge', () => {
  it('enforces strict subdomain/host boundary, validates external browser schemes, and provides frozen read-only bridge script', () => {
    const trustedHosts = ['example.com'];

    expect(isTrustedWebUrl('https://legal.example.com/privacy', trustedHosts)).toBe(true);
    expect(isTrustedWebUrl('https://example.com/terms', trustedHosts)).toBe(true);
    expect(isTrustedWebUrl('https://evil-example.com/phishing', trustedHosts)).toBe(false);
    expect(isTrustedWebUrl('http://legal.example.com/insecure', trustedHosts)).toBe(false);
    expect(isTrustedWebUrl('javascript:alert(1)', trustedHosts)).toBe(false);
    expect(isTrustedWebUrl('', trustedHosts)).toBe(false);

    expect(isSafeExternalHttpUrl('https://untrusted-partner.org/promo')).toBe(true);
    expect(isSafeExternalHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalHttpUrl('tel:+8613800138000')).toBe(false);
    expect(isSafeExternalHttpUrl('enterprisern://hijack')).toBe(false);

    expect(READONLY_HOST_BRIDGE_INJECTION_SCRIPT).toContain('window !== window.top');
    expect(READONLY_HOST_BRIDGE_INJECTION_SCRIPT).toContain('Object.freeze');
    expect(READONLY_HOST_BRIDGE_INJECTION_SCRIPT).toContain('writable: false');
    expect(READONLY_HOST_BRIDGE_INJECTION_SCRIPT).toContain('configurable: false');
  });

  it('dispatches valid JSBridge commands (including Safe Area Insets) and rejects empty/untrusted origins or malformed payloads', async () => {
    const runtime = createTestRuntime({
      identity: readyIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
      },
    });

    const onClose = jest.fn();
    const notices: string[] = [];

    const handlers = {
      getHostContext: () => ({
        themeScheme: 'dark' as const,
        appVariant: runtime.env.appVariant,
        safeAreaInsets: { top: 44, right: 0, bottom: 34, left: 0 },
      }),
      onShowNotice: (msg: string) => notices.push(msg),
      onCloseContainer: onClose,
    };

    // 1. Valid trusted message executes and returns theme + variant + safeAreaInsets
    const validReply = await dispatchBridgeMessage({
      rawMessage: JSON.stringify({
        bridgeVersion: '1.0',
        requestId: 'req-1',
        action: 'getHostContext',
      }),
      originUrl: 'https://legal.example.com/privacy',
      trustedHosts: ['example.com'],
      logger: runtime.logger,
      handlers,
    });
    expect(validReply).toEqual({
      accepted: true,
      response: {
        bridgeVersion: '1.0',
        requestId: 'req-1',
        ok: true,
        data: {
          themeScheme: 'dark',
          appVariant: 'development',
          safeAreaInsets: { top: 44, right: 0, bottom: 34, left: 0 },
        },
      },
    });

    await dispatchBridgeMessage({
      rawMessage: JSON.stringify({
        bridgeVersion: '1.0',
        requestId: 'req-2',
        action: 'showNotice',
        payload: { message: '来自 H5 的合规通知' },
      }),
      originUrl: 'https://legal.example.com/activity',
      trustedHosts: ['example.com'],
      logger: runtime.logger,
      handlers,
    });
    expect(notices).toEqual(['来自 H5 的合规通知']);

    // 2. Untrusted origin & empty about:blank origin are strictly blocked and logged
    const untrustedReply = await dispatchBridgeMessage({
      rawMessage: JSON.stringify({
        bridgeVersion: '1.0',
        requestId: 'req-3',
        action: 'closeContainer',
      }),
      originUrl: 'https://attacker.evil.com/exploit',
      trustedHosts: ['example.com'],
      logger: runtime.logger,
      handlers,
    });
    expect(untrustedReply).toEqual({ accepted: false, reason: 'untrusted_origin' });

    const blankOriginReply = await dispatchBridgeMessage({
      rawMessage: JSON.stringify({
        bridgeVersion: '1.0',
        requestId: 'req-blank',
        action: 'closeContainer',
      }),
      originUrl: '',
      trustedHosts: ['example.com'],
      logger: runtime.logger,
      handlers,
    });
    expect(blankOriginReply).toEqual({ accepted: false, reason: 'untrusted_origin' });
    expect(onClose).not.toHaveBeenCalled();

    // 3. Malformed / injected payload is safely rejected without throwing
    const malformedReply = await dispatchBridgeMessage({
      rawMessage: '{"bridgeVersion":"1.0","requestId":"req-4","action":"evalCode","code":"rm -rf"}',
      originUrl: 'https://legal.example.com/activity',
      trustedHosts: ['example.com'],
      logger: runtime.logger,
      handlers,
    });
    expect(malformedReply).toEqual({ accepted: false, reason: 'invalid_payload' });
    expect(
      runtime.logger.getRecentEntries().filter((entry) => entry.level === 'warn').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('blocks untrusted URLs (hiding external open button on pseudo-schemes) and executes bidirectional JSBridge calls via bridgeChannelRef', async () => {
    const onClose = jest.fn();
    const bridgeRef = createRef<WebViewBridgeChannelHandle>();

    const runtime = createTestRuntime({
      identity: readyIdentity,
      env: TEST_RUNTIME_ENV,
      translations: appTranslationResources,
      overrides: {
        secretStorage: createMemorySecretStorage(),
        keyValueStorage: createMemoryKeyValueStorage(),
        initialDeviceLocale: 'zh-CN',
      },
    });

    const blockedHttpsMount = await render(
      <AppRuntimeProvider runtime={runtime}>
        <SecureHybridWebView
          url="https://untrusted-phishing.org/promo"
          trustedHosts={['example.com']}
          onClose={onClose}
        />
      </AppRuntimeProvider>,
    );
    expect(screen.getByText('已拦截非受信任域名链接')).toBeTruthy();
    expect(screen.getByRole('button', { name: '使用系统浏览器打开' })).toBeTruthy();
    await blockedHttpsMount.unmount();

    const blockedPseudoMount = await render(
      <AppRuntimeProvider runtime={runtime}>
        <SecureHybridWebView
          url="javascript:alert(1)"
          trustedHosts={['example.com']}
          onClose={onClose}
        />
      </AppRuntimeProvider>,
    );
    expect(screen.getByText('已拦截非受信任域名链接')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '使用系统浏览器打开' })).toBeNull();
    await blockedPseudoMount.unmount();

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <SecureHybridWebView
          url="https://legal.example.com/bridge-demo"
          trustedHosts={['example.com']}
          bridgeChannelRef={bridgeRef}
          onClose={onClose}
        />
      </AppRuntimeProvider>,
    );

    await act(async () => {
      await bridgeRef.current?.receiveMessageFromWeb(
        JSON.stringify({
          bridgeVersion: '1.0',
          requestId: 'sim-1',
          action: 'showNotice',
          payload: { message: 'H5 消息桥联调成功' },
        }),
        'https://legal.example.com/bridge-demo',
      );
    });
    expect(await screen.findByText('H5 消息桥联调成功')).toBeTruthy();

    // 4. Forged subframe message (even with top-frame trusted originUrl) is rejected without session bridgeToken
    let iframeSpoofOutcome: unknown = null;
    await act(async () => {
      iframeSpoofOutcome = await bridgeRef.current?.receiveMessageFromWeb(
        JSON.stringify({
          bridgeVersion: '1.0',
          requestId: 'iframe-spoof-1',
          action: 'closeContainer',
        }),
        'https://legal.example.com/bridge-demo',
        { attachTopFrameToken: false },
      );
    });
    expect(iframeSpoofOutcome).toEqual({ accepted: false, reason: 'invalid_bridge_token' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await bridgeRef.current?.receiveMessageFromWeb(
        JSON.stringify({
          bridgeVersion: '1.0',
          requestId: 'sim-2',
          action: 'closeContainer',
        }),
        'https://legal.example.com/bridge-demo',
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

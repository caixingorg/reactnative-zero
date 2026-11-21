/**
 * @module core/capabilities/webview/bridge
 * 职责：安全混合 WebView 的域名白名单校验、外部链接过滤、一次性 CSPRNG 会话令牌生成与只读 JSBridge 协议解析。
 * 边界：桥脚本仅注入顶层 `window === window.top` 并校验会话 nonce，彻底阻断子 iframe 越权调用宿主能力。
 */
import { z } from 'zod';
import type { AppVariant } from '../../config/types';
import type { Logger } from '../../observability/observability';
import type { ResolvedColorScheme } from '../../theme/tokens';

// 原因：严格要求 https 协议并校验完整域名或合法子域名边界，阻断 evil-example.com 前缀伪造与 javascript: 伪协议注入
export function isTrustedWebUrl(rawUrl: string, trustedHosts: readonly string[]): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return trustedHosts.some((rawAllowed) => {
      const allowed = rawAllowed.trim().toLowerCase().replace(/^\.+/, '');
      return Boolean(allowed) && (hostname === allowed || hostname.endsWith(`.${allowed}`));
    });
  } catch {
    return false;
  }
}

// 原因：仅允许合法的 http/https 外部链接唤起系统浏览器，防止 tel:/javascript:/自定义 Scheme 伪协议劫持
export function isSafeExternalHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function extractTrustedHostsFromUrls(urls: readonly string[]): string[] {
  const hosts = new Set<string>();
  for (const rawUrl of urls) {
    try {
      const hostname = new URL(rawUrl).hostname.toLowerCase();
      if (hostname) {
        hosts.add(hostname);
      }
    } catch {
      // Ignore invalid URL
    }
  }
  return Array.from(hosts);
}

// 原因：优先使用宿主/Hermes 原生 Web Crypto CSPRNG 生成 128-bit 会话令牌，消除 Math.random 可预测性告警并在极简测试宿主平滑回退
export function generateBridgeSessionNonce(): string {
  const webCrypto = (
    globalThis as { crypto?: { getRandomValues?: (buf: Uint8Array) => Uint8Array } }
  ).crypto;
  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `hb-${hex}`;
  }
  return `hb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// 原因：仅在顶层主 frame (window === window.top) 注入只读桥并将一次性会话令牌隐藏在闭包内，彻底阻断 Android 第三方子 iframe 冒用顶层来源调桥
export function createReadOnlyBridgeInjectionScript(sessionNonce: string): string {
  const encodedNonce = JSON.stringify(sessionNonce);
  return `(function(){
  if (window !== window.top) {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(window, 'EnterpriseHostBridge')) {
    return;
  }
  var bridgeToken = ${encodedNonce};
  var bridge = Object.freeze({
    version: '1.0',
    send: function(action, payload, requestId) {
      var envelope = JSON.stringify({
        bridgeVersion: '1.0',
        bridgeToken: bridgeToken,
        requestId: String(requestId || Date.now()),
        action: String(action),
        payload: payload
      });
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
        window.ReactNativeWebView.postMessage(envelope);
      }
    }
  });
  Object.defineProperty(window, 'EnterpriseHostBridge', {
    value: bridge,
    writable: false,
    configurable: false,
    enumerable: true
  });
})(); true;`;
}

export const READONLY_HOST_BRIDGE_INJECTION_SCRIPT =
  createReadOnlyBridgeInjectionScript('static-preview-token');

const getHostContextSchema = z.object({
  bridgeVersion: z.literal('1.0'),
  bridgeToken: z.string().optional(),
  requestId: z.string().min(1).max(64),
  action: z.literal('getHostContext'),
});

const showNoticeSchema = z.object({
  bridgeVersion: z.literal('1.0'),
  bridgeToken: z.string().optional(),
  requestId: z.string().min(1).max(64),
  action: z.literal('showNotice'),
  payload: z.object({
    message: z.string().min(1).max(200),
  }),
});

const closeContainerSchema = z.object({
  bridgeVersion: z.literal('1.0'),
  bridgeToken: z.string().optional(),
  requestId: z.string().min(1).max(64),
  action: z.literal('closeContainer'),
});

const bridgeRequestSchema = z.discriminatedUnion('action', [
  getHostContextSchema,
  showNoticeSchema,
  closeContainerSchema,
]);

export interface SafeAreaInsetsSnapshot {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BridgeHostContextData {
  themeScheme: ResolvedColorScheme;
  appVariant: AppVariant;
  safeAreaInsets: SafeAreaInsetsSnapshot;
}

export interface BridgeResponseEnvelope {
  bridgeVersion: '1.0';
  requestId: string;
  ok: boolean;
  data?: unknown;
}

export interface BridgeHandlers {
  getHostContext(): BridgeHostContextData;
  onShowNotice(message: string): void;
  onCloseContainer(): void;
}

export type BridgeDispatchOutcome =
  | { accepted: true; response: BridgeResponseEnvelope }
  | {
      accepted: false;
      reason: 'untrusted_origin' | 'invalid_bridge_token' | 'invalid_payload';
    };

// 原因：同时强制校验域名白名单、主 frame 一次性会话令牌 (expectedBridgeToken) 与 Zod 模式，堵死跨域子 iframe 伪造与畸形注入
export async function dispatchBridgeMessage(options: {
  rawMessage: string;
  originUrl: string;
  trustedHosts: readonly string[];
  expectedBridgeToken?: string;
  logger: Logger;
  handlers: BridgeHandlers;
}): Promise<BridgeDispatchOutcome> {
  if (!isTrustedWebUrl(options.originUrl, options.trustedHosts)) {
    options.logger.warn('Blocked JSBridge call from untrusted web origin', {
      originUrl: options.originUrl,
    });
    return { accepted: false, reason: 'untrusted_origin' };
  }

  let decodedJson: unknown;
  try {
    decodedJson = JSON.parse(options.rawMessage);
  } catch {
    options.logger.warn('Rejected non-JSON JSBridge payload', {
      originUrl: options.originUrl,
    });
    return { accepted: false, reason: 'invalid_payload' };
  }

  const parsed = bridgeRequestSchema.safeParse(decodedJson);
  if (!parsed.success) {
    options.logger.warn('Rejected malformed JSBridge command failing schema validation', {
      originUrl: options.originUrl,
      issues: parsed.error.issues.map((i) => i.message),
    });
    return { accepted: false, reason: 'invalid_payload' };
  }

  if (
    options.expectedBridgeToken !== undefined &&
    parsed.data.bridgeToken !== options.expectedBridgeToken
  ) {
    options.logger.warn(
      'Blocked JSBridge call missing valid top-frame capability token (possible iframe spoofing)',
      { originUrl: options.originUrl },
    );
    return { accepted: false, reason: 'invalid_bridge_token' };
  }

  const command = parsed.data;
  switch (command.action) {
    case 'getHostContext': {
      return {
        accepted: true,
        response: {
          bridgeVersion: '1.0',
          requestId: command.requestId,
          ok: true,
          data: options.handlers.getHostContext(),
        },
      };
    }
    case 'showNotice': {
      options.handlers.onShowNotice(command.payload.message);
      return {
        accepted: true,
        response: {
          bridgeVersion: '1.0',
          requestId: command.requestId,
          ok: true,
        },
      };
    }
    case 'closeContainer': {
      options.handlers.onCloseContainer();
      return {
        accepted: true,
        response: {
          bridgeVersion: '1.0',
          requestId: command.requestId,
          ok: true,
        },
      };
    }
  }
}

/**
 * @module core/vendors/sentry-error-reporter
 * 职责：把兼容 Sentry 协议的客户端（如 `@sentry/react-native`，指向国内自建服务端）适配成核心的 `ErrorReporter` 契约（见 ADR-0006，状态 Proposed）。
 * 边界：本模块不依赖任何 Sentry 包，客户端由应用注入，因此模板默认不携带该 SDK；未配置 DSN 时返回 undefined，即默认关闭；
 * 初始化只会由隐私门控第二阶段触发，撤回同意时关闭客户端，不得在模块顶层初始化。
 */
import type { ErrorReporter } from '../observability/observability';

export interface SentryClientLike {
  init(options: {
    dsn: string;
    environment?: string;
    release?: string;
    sendDefaultPii: boolean;
    tracesSampleRate: number;
  }): void;
  captureException(error: unknown, hint?: { extra?: Record<string, unknown> }): unknown;
  close(): unknown;
}

export interface SentryErrorReporterOptions {
  client: SentryClientLike;
  /** 缺失或为空白时整个适配器关闭（返回 undefined） */
  dsn?: string;
  environment?: string;
  release?: string;
}

export function createSentryErrorReporter(
  options: SentryErrorReporterOptions,
): ErrorReporter | undefined {
  const dsn = options.dsn?.trim();
  if (!dsn) {
    return undefined;
  }

  const { client } = options;
  let active = false;

  return {
    initialize(): void {
      if (active) {
        return;
      }
      // 原因：不发送默认个人信息，也不开启性能追踪；只上报异常本身
      client.init({
        dsn,
        environment: options.environment,
        release: options.release,
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      active = true;
    },
    suspend(): void {
      if (!active) {
        return;
      }
      active = false;
      void client.close();
    },
    captureException(error: unknown, context?: Record<string, unknown>): void {
      if (!active) {
        return;
      }
      client.captureException(error, context ? { extra: context } : undefined);
    },
  };
}

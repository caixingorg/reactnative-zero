/**
 * @module core/observability/observability
 * 职责：提供固定容量环形日志缓冲（100 条）、全局 JS/Promise 未捕获异常接管，以及崩溃上报/埋点适配器契约。
 * 边界：`errorReporter` 与 `analytics` 须由 Privacy Gate 二阶段钩子激活，未授权前处于静默/挂起态。
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  getRecentEntries(): readonly LogEntry[];
  clearEntries(): void;
}

export interface ErrorReporter {
  initialize(): void | Promise<void>;
  suspend?(): void;
  captureException(error: unknown, context?: Record<string, unknown>): void;
}

export interface AnalyticsTracker {
  initialize(): void | Promise<void>;
  suspend?(): void;
  trackEvent(eventName: string, properties?: Record<string, unknown>): void;
}

export interface ObservabilitySuite {
  logger: Logger;
  errorReporter: ErrorReporter;
  analytics: AnalyticsTracker;
  revokeConsent(): void;
}

export type GlobalJsErrorHandler = (error: unknown, isFatal?: boolean) => void;

export interface GlobalErrorUtilsLike {
  getGlobalHandler(): GlobalJsErrorHandler | undefined;
  setGlobalHandler(handler: GlobalJsErrorHandler): void;
}

export interface PromiseRejectionTrackerOptions {
  allRejections?: boolean;
  onUnhandled?: (id: number, error: unknown) => void;
  onHandled?: (id: number) => void;
}

export interface HermesPromiseTrackerLike {
  hasPromise?: () => boolean;
  enablePromiseRejectionTracker?: (options: PromiseRejectionTrackerOptions) => void;
}

export interface RingBufferLoggerOptions {
  maxEntries?: number;
  mirrorToConsole?: boolean;
}

// 原因：采用固定容量环形缓冲保存最近日志，既供本地排障检视现场，又防止长期运行产生内存泄漏
export function createRingBufferLogger(options: RingBufferLoggerOptions = {}): Logger {
  const maxEntries = options.maxEntries ?? 100;
  const mirrorToConsole = options.mirrorToConsole ?? false;
  const entries: LogEntry[] = [];

  function append(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (entries.length >= maxEntries) {
      entries.shift();
    }
    entries.push({
      timestamp: Date.now(),
      level,
      message,
      metadata,
    });

    if (mirrorToConsole) {
      const consoleFn =
        level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
      consoleFn(`[${level.toUpperCase()}] ${message}`, metadata ?? '');
    }
  }

  return {
    debug: (message, metadata) => append('debug', message, metadata),
    info: (message, metadata) => append('info', message, metadata),
    warn: (message, metadata) => append('warn', message, metadata),
    error: (message, metadata) => append('error', message, metadata),
    getRecentEntries: () => [...entries],
    clearEntries: () => {
      entries.length = 0;
    },
  };
}

// 原因：遵循 ADR-0004，在二阶段隐私同意前（或撤回同意后）严格关闭外部上报阀门；底层委托 SDK 仅初始化一次以防重复挂载原生监听
export function createConsentGatedErrorReporter(
  delegate: ErrorReporter | undefined,
  logger: Logger,
): ErrorReporter {
  let consentActive = false;
  let delegateInitialized = false;

  return {
    async initialize(): Promise<void> {
      consentActive = true;
      logger.info('ErrorReporter initialized');
      if (delegate && !delegateInitialized) {
        delegateInitialized = true;
        await delegate.initialize();
      }
    },
    suspend(): void {
      consentActive = false;
      // 原因：只有实现了 suspend 的委托方才会被真正关闭（如 Sentry client.close），重新同意时必须让它能再次初始化；
      // 没有 suspend 的委托方保持「只初始化一次」，避免重复挂载原生监听
      if (delegate?.suspend) {
        delegateInitialized = false;
        delegate.suspend();
      }
      logger.info('ErrorReporter suspended after privacy consent reset');
    },
    captureException(error: unknown, context?: Record<string, unknown>): void {
      if (!consentActive) {
        logger.warn('Suppressed external error reporting prior to Phase 2 consent', context);
        return;
      }
      if (delegate) {
        delegate.captureException(error, context);
      }
    },
  };
}

export function createConsentGatedAnalyticsTracker(
  delegate: AnalyticsTracker | undefined,
  logger: Logger,
): AnalyticsTracker {
  let consentActive = false;
  let delegateInitialized = false;

  return {
    async initialize(): Promise<void> {
      consentActive = true;
      logger.info('AnalyticsTracker initialized');
      if (delegate && !delegateInitialized) {
        delegateInitialized = true;
        await delegate.initialize();
      }
    },
    suspend(): void {
      consentActive = false;
      delegate?.suspend?.();
    },
    trackEvent(eventName: string, properties?: Record<string, unknown>): void {
      if (!consentActive) {
        return;
      }
      if (delegate) {
        delegate.trackEvent(eventName, properties);
        return;
      }
      logger.debug(`Analytics event: ${eventName}`, properties);
    },
  };
}

export interface CreateObservabilitySuiteOptions {
  mirrorToConsole?: boolean;
  logger?: Logger;
  errorReporter?: ErrorReporter;
  analytics?: AnalyticsTracker;
}

export function createObservabilitySuite(
  options: CreateObservabilitySuiteOptions = {},
): ObservabilitySuite {
  const logger =
    options.logger ??
    createRingBufferLogger({
      maxEntries: 100,
      mirrorToConsole: options.mirrorToConsole ?? false,
    });

  const errorReporter = createConsentGatedErrorReporter(options.errorReporter, logger);
  const analytics = createConsentGatedAnalyticsTracker(options.analytics, logger);

  return {
    logger,
    errorReporter,
    analytics,
    revokeConsent: () => {
      errorReporter.suspend?.();
      analytics.suspend?.();
    },
  };
}

type UnhandledRejectionListener = (id: number, error: unknown) => void;

const hermesRejectionListeners = new Set<UnhandledRejectionListener>();
let hermesTrackerInstalled = false;

function ensureHermesRejectionHub(hermes: HermesPromiseTrackerLike | undefined): void {
  if (hermesTrackerInstalled || !hermes?.hasPromise?.() || !hermes.enablePromiseRejectionTracker) {
    return;
  }
  // 原因：RN 0.88 默认仅在 __DEV__ 启用 Hermes Promise 拒绝追踪（生产态静默丢失）；仅在非 __DEV__ 或显式注入测试桩时接管扇出，避免覆盖开发态 RedBox 追踪器
  const isDevRuntime =
    typeof (globalThis as { __DEV__?: boolean }).__DEV__ === 'boolean' &&
    Boolean((globalThis as { __DEV__?: boolean }).__DEV__);
  if (isDevRuntime) {
    return;
  }
  hermesTrackerInstalled = true;
  hermes.enablePromiseRejectionTracker({
    allRejections: true,
    onUnhandled: (id, rejection) => {
      for (const listener of hermesRejectionListeners) {
        listener(id, rejection);
      }
    },
  });
}

export interface InstallGlobalErrorHandlersOptions {
  logger: Logger;
  errorReporter: ErrorReporter;
  errorUtils?: GlobalErrorUtilsLike;
  hermesInternal?: HermesPromiseTrackerLike;
}

// 原因：统一兜底事件回调同步未捕获异常 (ErrorUtils) 与异步未处理 Promise 拒绝，记录环形日志并经隐私门控上报后继续透传原宿主处理器
export function installGlobalErrorHandlers({
  logger,
  errorReporter,
  errorUtils,
  hermesInternal,
}: InstallGlobalErrorHandlersOptions): () => void {
  const resolvedErrorUtils =
    errorUtils ?? (globalThis as { ErrorUtils?: GlobalErrorUtilsLike }).ErrorUtils;
  const resolvedHermes =
    hermesInternal ?? (globalThis as { HermesInternal?: HermesPromiseTrackerLike }).HermesInternal;

  let reentrancyLock = false;
  const cleanups: (() => void)[] = [];

  if (resolvedErrorUtils) {
    const previousHandler = resolvedErrorUtils.getGlobalHandler();
    const wrappedHandler: GlobalJsErrorHandler = (error, isFatal) => {
      if (!reentrancyLock) {
        reentrancyLock = true;
        try {
          const errMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Unhandled JS exception${isFatal ? ' (fatal)' : ''}: ${errMessage}`, {
            isFatal: Boolean(isFatal),
          });
          errorReporter.captureException(error, {
            source: 'js-global',
            isFatal: Boolean(isFatal),
          });
        } finally {
          reentrancyLock = false;
        }
      }
      previousHandler?.(error, isFatal);
    };

    resolvedErrorUtils.setGlobalHandler(wrappedHandler);
    cleanups.push(() => {
      if (resolvedErrorUtils.getGlobalHandler() === wrappedHandler && previousHandler) {
        resolvedErrorUtils.setGlobalHandler(previousHandler);
      }
    });
  }

  const recordUnhandledRejection = (id: number, rejection: unknown): void => {
    if (reentrancyLock) {
      return;
    }
    reentrancyLock = true;
    try {
      const reasonText = rejection instanceof Error ? rejection.message : String(rejection);
      logger.error(`Unhandled Promise rejection [id=${id}]: ${reasonText}`);
      errorReporter.captureException(
        rejection instanceof Error ? rejection : new Error(reasonText),
        {
          source: 'unhandled-promise-rejection',
          rejectionId: id,
        },
      );
    } finally {
      reentrancyLock = false;
    }
  };

  if (hermesInternal) {
    hermesInternal.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: recordUnhandledRejection,
    });
  } else {
    ensureHermesRejectionHub(resolvedHermes);
    hermesRejectionListeners.add(recordUnhandledRejection);
    cleanups.push(() => {
      hermesRejectionListeners.delete(recordUnhandledRejection);
    });
  }

  const eventTarget = globalThis as unknown as {
    addEventListener?: (type: string, listener: (event: { reason?: unknown }) => void) => void;
    removeEventListener?: (type: string, listener: (event: { reason?: unknown }) => void) => void;
  };
  if (
    typeof eventTarget.addEventListener === 'function' &&
    typeof eventTarget.removeEventListener === 'function'
  ) {
    const onUnhandledEvent = (event: { reason?: unknown }): void => {
      recordUnhandledRejection(0, event.reason);
    };
    eventTarget.addEventListener('unhandledrejection', onUnhandledEvent);
    cleanups.push(() => {
      eventTarget.removeEventListener?.('unhandledrejection', onUnhandledEvent);
    });
  }

  return () => {
    for (const fn of cleanups) {
      fn();
    }
  };
}

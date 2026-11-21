/**
 * @module core/capabilities/payment/checkout-coordinator
 * 职责：一次性支付核心编排器——管理开放式驱动注册表、单飞并发锁、MMKV 落盘、AppState 切回无回调宽限期兜底、指数退避查单与冷启恢复。
 */
import type { PendingSessionStore } from './pending-session-store';
import type {
  CheckoutDriver,
  CheckoutPayOptions,
  DriverExecutionResult,
  PaymentAppStateWatcher,
  PaymentEvent,
  PaymentExecutionIntent,
  PaymentOutcome,
  RecoverSessionsOptions,
  ServerOrderVerifier,
} from './types';

const DEFAULT_FOREGROUND_GRACE_MS = 1500;
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_POLL_BACKOFF_MS: readonly number[] = [500, 1000, 2000, 4000];

export interface PaymentConcurrencyLock {
  tryAcquire(): boolean;
  release(): void;
}

export function createPaymentConcurrencyLock(): PaymentConcurrencyLock {
  let locked = false;
  return {
    tryAcquire(): boolean {
      if (locked) {
        return false;
      }
      locked = true;
      return true;
    },
    release(): void {
      locked = false;
    },
  };
}

export interface CheckoutCoordinatorDeps {
  sessionStore: PendingSessionStore;
  verifier: ServerOrderVerifier;
  concurrencyLock?: PaymentConcurrencyLock;
  appStateWatcher?: PaymentAppStateWatcher;
  foregroundGraceMs?: number;
  defaultSessionTtlMs?: number;
  pollBackoffMs?: readonly number[];
  now: () => number;
  emitEvent: (event: Omit<PaymentEvent, 'timestamp'>) => void;
  emitRecovered: (outcome: PaymentOutcome) => void;
}

export interface CheckoutCoordinator {
  registerDriver(driver: CheckoutDriver): void;
  getDriver(driverId: string): CheckoutDriver | undefined;
  listDrivers(): CheckoutDriver[];
  pay<TPayload = unknown>(
    intent: PaymentExecutionIntent<TPayload>,
    options: CheckoutPayOptions,
  ): Promise<PaymentOutcome>;
  recoverPendingSessions(options: RecoverSessionsOptions): Promise<PaymentOutcome[]>;
  dispose(): void;
}

function createAbortableDelay(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function createCheckoutCoordinator(deps: CheckoutCoordinatorDeps): CheckoutCoordinator {
  const drivers = new Map<string, CheckoutDriver>();
  const concurrencyLock = deps.concurrencyLock ?? createPaymentConcurrencyLock();
  const foregroundGraceMs = deps.foregroundGraceMs ?? DEFAULT_FOREGROUND_GRACE_MS;
  const defaultSessionTtlMs = deps.defaultSessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const pollBackoffMs = deps.pollBackoffMs ?? DEFAULT_POLL_BACKOFF_MS;

  const activeCleanupFns = new Set<() => void>();

  const verifyWithBackoff = async (
    orderId: string,
    channelCode: string,
    driverId: string,
    abortSignal: AbortSignal,
  ): Promise<PaymentOutcome> => {
    let lastNetworkError: string | undefined;

    const attemptVerify = async (): Promise<PaymentOutcome | null> => {
      try {
        const res = await deps.verifier.verifyCheckoutOrder(orderId);
        lastNetworkError = undefined;
        if (res.status === 'paid') {
          return {
            orderId,
            channelCode,
            driverId,
            status: 'succeeded',
            message: res.message,
            verifiedByServer: true,
          };
        }
        if (res.status === 'expired') {
          return {
            orderId,
            channelCode,
            driverId,
            status: 'failed',
            errorCode: 'ORDER_EXPIRED',
            message: res.message,
            verifiedByServer: true,
          };
        }
        if (res.status === 'failed') {
          return {
            orderId,
            channelCode,
            driverId,
            status: 'failed',
            errorCode: 'UNKNOWN',
            message: res.message,
            verifiedByServer: true,
          };
        }
        return null;
      } catch (error: unknown) {
        // 原因：从外部支付切回前台瞬间网络可能短暂不可达，记录错误并继续执行退避重试而非首次即放弃
        lastNetworkError = error instanceof Error ? error.message : 'Order verification failed.';
        return null;
      }
    };

    const immediate = await attemptVerify();
    if (immediate) {
      return immediate;
    }

    for (const waitMs of pollBackoffMs) {
      const completed = await createAbortableDelay(waitMs, abortSignal);
      if (!completed || abortSignal.aborted) {
        break;
      }
      const next = await attemptVerify();
      if (next) {
        return next;
      }
    }

    if (lastNetworkError !== undefined) {
      return {
        orderId,
        channelCode,
        driverId,
        status: 'pending',
        errorCode: 'NETWORK_ERROR',
        message: lastNetworkError,
        verifiedByServer: false,
      };
    }

    return {
      orderId,
      channelCode,
      driverId,
      status: 'pending',
      errorCode: 'VERIFY_TIMEOUT',
      message: 'Payment is still processing on the server.',
      verifiedByServer: false,
    };
  };

  // 原因：部分原生支付 SDK（如微信/支付宝）在用户通过系统任务栏手动切回时永不触发回调，需在切回前台等待宽限期后自动转后端查单，并通知驱动清理全局监听
  const executeWithForegroundFallback = (
    driver: CheckoutDriver,
    intent: PaymentExecutionIntent<unknown>,
    sessionAbortController: AbortController,
  ): Promise<DriverExecutionResult> => {
    const runDriverSafe = (): Promise<DriverExecutionResult> =>
      driver.execute(intent, { signal: sessionAbortController.signal }).catch((error: unknown) => ({
        status: 'failed',
        errorCode: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'Driver execution threw.',
      }));

    if (!deps.appStateWatcher) {
      return runDriverSafe();
    }

    return new Promise<DriverExecutionResult>((resolve) => {
      let settled = false;
      let sawBackground = deps.appStateWatcher?.getCurrentState() !== 'active';
      let graceTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (graceTimer !== null) {
          clearTimeout(graceTimer);
          graceTimer = null;
        }
        unsubscribe();
        sessionAbortController.signal.removeEventListener('abort', onExternalAbort);
      };

      const finish = (result: DriverExecutionResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      };

      const onExternalAbort = (): void => {
        finish({ status: 'pending' });
      };

      const unsubscribe = deps.appStateWatcher!.subscribe((nextState) => {
        if (settled) {
          return;
        }
        if (nextState === 'background' || nextState === 'inactive') {
          sawBackground = true;
          if (graceTimer !== null) {
            clearTimeout(graceTimer);
            graceTimer = null;
          }
          return;
        }
        if (nextState === 'active' && sawBackground && graceTimer === null) {
          graceTimer = setTimeout(() => {
            deps.emitEvent({
              type: 'checkout_foreground_fallback',
              orderId: intent.orderId,
              channelCode: intent.channelCode,
              driverId: intent.driverId,
            });
            // 通知驱动清理深链等外部监听，防止监听永久泄漏
            sessionAbortController.abort();
            finish({ status: 'pending' });
          }, foregroundGraceMs);
        }
      });

      sessionAbortController.signal.addEventListener('abort', onExternalAbort, { once: true });

      void runDriverSafe().then((res) => finish(res));
    });
  };

  return {
    registerDriver(driver: CheckoutDriver): void {
      drivers.set(driver.driverId, driver);
    },

    getDriver(driverId: string): CheckoutDriver | undefined {
      return drivers.get(driverId);
    },

    listDrivers(): CheckoutDriver[] {
      return Array.from(drivers.values());
    },

    async pay<TPayload = unknown>(
      intent: PaymentExecutionIntent<TPayload>,
      options: CheckoutPayOptions,
    ): Promise<PaymentOutcome> {
      const driver = drivers.get(intent.driverId);
      if (!driver) {
        return {
          orderId: intent.orderId,
          channelCode: intent.channelCode,
          driverId: intent.driverId,
          status: 'failed',
          errorCode: 'DRIVER_NOT_REGISTERED',
          message: `Payment driver "${intent.driverId}" is not registered.`,
          verifiedByServer: false,
        };
      }

      // 原因：必须在首个 await（driver.isAvailable）前同步获取共享单飞锁，杜绝用户快速连点穿过异步间隙引发并发拉起
      if (!concurrencyLock.tryAcquire()) {
        return {
          orderId: intent.orderId,
          channelCode: intent.channelCode,
          driverId: intent.driverId,
          status: 'failed',
          errorCode: 'PAYMENT_IN_PROGRESS',
          message: 'Another payment is already in progress.',
          verifiedByServer: false,
        };
      }

      const driverAbortController = new AbortController();
      const verifyAbortController = new AbortController();
      const abortAll = (): void => {
        driverAbortController.abort();
        verifyAbortController.abort();
      };
      activeCleanupFns.add(abortAll);

      try {
        let available = false;
        try {
          available = await driver.isAvailable();
        } catch {
          available = false;
        }
        if (!available) {
          return {
            orderId: intent.orderId,
            channelCode: intent.channelCode,
            driverId: intent.driverId,
            status: 'failed',
            errorCode: 'APP_NOT_INSTALLED',
            message: `Payment driver "${intent.driverId}" is unavailable on this device.`,
            verifiedByServer: false,
          };
        }

        const nowMs = deps.now();
        const expiresAt = intent.expiresAt ?? nowMs + defaultSessionTtlMs;

        deps.sessionStore.save({
          orderId: intent.orderId,
          channelCode: intent.channelCode,
          driverId: intent.driverId,
          userId: options.userId,
          createdAt: nowMs,
          expiresAt,
        });

        deps.emitEvent({
          type: 'checkout_started',
          orderId: intent.orderId,
          channelCode: intent.channelCode,
          driverId: intent.driverId,
        });

        const execResult = await executeWithForegroundFallback(
          driver,
          intent,
          driverAbortController,
        );

        if (execResult.status === 'cancelled') {
          deps.sessionStore.remove(intent.orderId);
          const cancelled: PaymentOutcome = {
            orderId: intent.orderId,
            channelCode: intent.channelCode,
            driverId: intent.driverId,
            status: 'cancelled',
            errorCode: execResult.errorCode ?? 'CANCELLED',
            rawCode: execResult.rawCode,
            message: execResult.message,
            verifiedByServer: false,
          };
          deps.emitEvent({
            type: 'checkout_settled',
            orderId: cancelled.orderId,
            channelCode: cancelled.channelCode,
            driverId: cancelled.driverId,
            status: cancelled.status,
            errorCode: cancelled.errorCode,
            verifiedByServer: false,
          });
          return cancelled;
        }

        if (execResult.status === 'failed') {
          deps.sessionStore.remove(intent.orderId);
          const failed: PaymentOutcome = {
            orderId: intent.orderId,
            channelCode: intent.channelCode,
            driverId: intent.driverId,
            status: 'failed',
            errorCode: execResult.errorCode ?? 'UNKNOWN',
            rawCode: execResult.rawCode,
            message: execResult.message,
            verifiedByServer: false,
          };
          deps.emitEvent({
            type: 'checkout_settled',
            orderId: failed.orderId,
            channelCode: failed.channelCode,
            driverId: failed.driverId,
            status: failed.status,
            errorCode: failed.errorCode,
            verifiedByServer: false,
          });
          return failed;
        }

        // 原因：前端回调仅作为触发后端查单的信号，绝不直接作为支付成功凭据
        const verifiedOutcome = await verifyWithBackoff(
          intent.orderId,
          intent.channelCode,
          intent.driverId,
          verifyAbortController.signal,
        );

        if (verifiedOutcome.status !== 'pending') {
          deps.sessionStore.remove(intent.orderId);
        }

        deps.emitEvent({
          type: 'checkout_settled',
          orderId: verifiedOutcome.orderId,
          channelCode: verifiedOutcome.channelCode,
          driverId: verifiedOutcome.driverId,
          status: verifiedOutcome.status,
          errorCode: verifiedOutcome.errorCode,
          verifiedByServer: verifiedOutcome.verifiedByServer,
        });

        return verifiedOutcome;
      } finally {
        activeCleanupFns.delete(abortAll);
        concurrencyLock.release();
      }
    },

    async recoverPendingSessions(options: RecoverSessionsOptions): Promise<PaymentOutcome[]> {
      const validSessions = deps.sessionStore.pruneExpired(deps.now());
      const userSessions = validSessions.filter((session) => session.userId === options.userId);
      const outcomes: PaymentOutcome[] = [];

      for (const session of userSessions) {
        let res: { status: 'paid' | 'pending' | 'failed' | 'expired'; message?: string };
        try {
          res = await deps.verifier.verifyCheckoutOrder(session.orderId);
        } catch {
          // 原因：单笔订单网络查单失败不得中断同用户其余待恢复订单的核对，保留该笔会话待下次重试
          continue;
        }

        if (res.status === 'pending') {
          continue;
        }

        deps.sessionStore.remove(session.orderId);
        const outcome: PaymentOutcome =
          res.status === 'paid'
            ? {
                orderId: session.orderId,
                channelCode: session.channelCode,
                driverId: session.driverId,
                status: 'succeeded',
                message: res.message,
                verifiedByServer: true,
              }
            : {
                orderId: session.orderId,
                channelCode: session.channelCode,
                driverId: session.driverId,
                status: 'failed',
                errorCode: res.status === 'expired' ? 'ORDER_EXPIRED' : 'UNKNOWN',
                message: res.message,
                verifiedByServer: true,
              };

        outcomes.push(outcome);
        deps.emitEvent({
          type: 'checkout_recovered',
          orderId: outcome.orderId,
          channelCode: outcome.channelCode,
          driverId: outcome.driverId,
          status: outcome.status,
          errorCode: outcome.errorCode,
          verifiedByServer: outcome.verifiedByServer,
        });
        deps.emitRecovered(outcome);
      }

      return outcomes;
    },

    dispose(): void {
      for (const cleanup of activeCleanupFns) {
        cleanup();
      }
      activeCleanupFns.clear();
    },
  };
}

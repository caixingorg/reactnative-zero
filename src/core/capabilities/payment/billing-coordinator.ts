/**
 * @module core/capabilities/payment/billing-coordinator
 * 职责：Apple IAP / Google Billing 应用内购与自动续费订阅编排器——负责商品拉取、购买、恢复购买、未核销掉单监听与安全 finishTransaction 闸门。
 */
import { createPaymentConcurrencyLock, type PaymentConcurrencyLock } from './checkout-coordinator';
import type {
  PaymentEvent,
  PaymentOutcome,
  ServerOrderVerifier,
  StoreBillingDriver,
  StoreProduct,
  StoreProductType,
  StorePurchaseOptions,
  StorePurchaseTransaction,
} from './types';

export interface StoreBillingCoordinatorDeps {
  verifier: ServerOrderVerifier;
  concurrencyLock?: PaymentConcurrencyLock;
  emitEvent: (event: Omit<PaymentEvent, 'timestamp'>) => void;
  emitRecovered: (outcome: PaymentOutcome) => void;
}

export interface StoreBillingCoordinator {
  setDriver(driver: StoreBillingDriver): void;
  getDriver(): StoreBillingDriver | undefined;
  initialize(): Promise<void>;
  fetchProducts(productIds: string[], type: StoreProductType): Promise<StoreProduct[]>;
  purchase(productId: string, options?: StorePurchaseOptions): Promise<PaymentOutcome>;
  restorePurchases(): Promise<PaymentOutcome[]>;
  dispose(): void;
}

export function createStoreBillingCoordinator(
  deps: StoreBillingCoordinatorDeps,
): StoreBillingCoordinator {
  const concurrencyLock = deps.concurrencyLock ?? createPaymentConcurrencyLock();
  let driver: StoreBillingDriver | undefined;
  let unsubscribeUnfinished: (() => void) | null = null;
  let initialized = false;
  let initPromise: Promise<void> | null = null;

  const verifyAndMaybeFinish = async (
    activeDriver: StoreBillingDriver,
    tx: StorePurchaseTransaction,
    defaultIsConsumable: boolean,
  ): Promise<PaymentOutcome> => {
    const channelCode = tx.platform === 'ios' ? 'apple_iap' : 'google_billing';

    if (!deps.verifier.verifyStoreTransaction) {
      return {
        orderId: tx.transactionId,
        channelCode,
        driverId: activeDriver.driverId,
        status: 'failed',
        errorCode: 'RECEIPT_VERIFY_FAILED',
        message: 'Server store transaction verifier is not configured.',
        verifiedByServer: false,
      };
    }

    try {
      const verification = await deps.verifier.verifyStoreTransaction(tx);
      const orderId = verification.orderId ?? tx.transactionId;
      const isConsumable = verification.isConsumable ?? defaultIsConsumable;

      // 原因：仅当后端明确确认已发货或已幂等处理时才调用 finishTransaction，杜绝扣款后断网导致的掉单损失
      if (verification.shouldFinishTransaction) {
        await activeDriver.finishTransaction(tx, isConsumable);
      }

      if (!verification.verified) {
        return {
          orderId,
          channelCode,
          driverId: activeDriver.driverId,
          status: 'failed',
          errorCode: 'RECEIPT_VERIFY_FAILED',
          message: verification.message ?? 'Receipt verification rejected by server.',
          verifiedByServer: false,
        };
      }

      return {
        orderId,
        channelCode,
        driverId: activeDriver.driverId,
        status: 'succeeded',
        message: verification.message,
        verifiedByServer: true,
      };
    } catch (error: unknown) {
      return {
        orderId: tx.transactionId,
        channelCode,
        driverId: activeDriver.driverId,
        status: 'failed',
        errorCode: 'RECEIPT_VERIFY_FAILED',
        message: error instanceof Error ? error.message : 'Receipt verification failed.',
        verifiedByServer: false,
      };
    }
  };

  return {
    setDriver(nextDriver: StoreBillingDriver): void {
      if (unsubscribeUnfinished) {
        unsubscribeUnfinished();
        unsubscribeUnfinished = null;
      }
      driver = nextDriver;
      initialized = false;
      initPromise = null;
    },

    getDriver(): StoreBillingDriver | undefined {
      return driver;
    },

    async initialize(): Promise<void> {
      if (!driver || initialized) {
        return;
      }
      if (initPromise) {
        return initPromise;
      }

      const activeDriver = driver;
      initPromise = (async () => {
        await activeDriver.initialize();
        if (driver !== activeDriver) {
          return;
        }
        if (unsubscribeUnfinished) {
          unsubscribeUnfinished();
        }
        unsubscribeUnfinished = activeDriver.subscribeUnfinishedTransactions((tx) => {
          void verifyAndMaybeFinish(activeDriver, tx, false).then((outcome) => {
            deps.emitEvent({
              type: 'billing_unfinished_recovered',
              orderId: outcome.orderId,
              channelCode: outcome.channelCode,
              driverId: outcome.driverId,
              status: outcome.status,
              errorCode: outcome.errorCode,
              verifiedByServer: outcome.verifiedByServer,
            });
            if (outcome.status === 'succeeded') {
              deps.emitRecovered(outcome);
            }
          });
        });
        initialized = true;
      })().finally(() => {
        initPromise = null;
      });

      return initPromise;
    },

    async fetchProducts(productIds: string[], type: StoreProductType): Promise<StoreProduct[]> {
      if (!driver) {
        return [];
      }
      try {
        const available = await driver.isAvailable();
        if (!available) {
          return [];
        }
        return await driver.fetchProducts(productIds, type);
      } catch {
        return [];
      }
    },

    async purchase(productId: string, options?: StorePurchaseOptions): Promise<PaymentOutcome> {
      if (!driver) {
        return {
          orderId: productId,
          channelCode: 'store_billing',
          driverId: 'unregistered',
          status: 'failed',
          errorCode: 'STORE_BILLING_UNAVAILABLE',
          message: 'Store billing driver is not configured.',
          verifiedByServer: false,
        };
      }

      if (!concurrencyLock.tryAcquire()) {
        return {
          orderId: productId,
          channelCode: 'store_billing',
          driverId: driver.driverId,
          status: 'failed',
          errorCode: 'PAYMENT_IN_PROGRESS',
          message: 'Another payment is already in progress.',
          verifiedByServer: false,
        };
      }

      const activeDriver = driver;
      try {
        let available = false;
        try {
          available = await activeDriver.isAvailable();
        } catch {
          available = false;
        }
        if (!available) {
          return {
            orderId: productId,
            channelCode: 'store_billing',
            driverId: activeDriver.driverId,
            status: 'failed',
            errorCode: 'STORE_BILLING_UNAVAILABLE',
            message: 'Store billing is unavailable on this device.',
            verifiedByServer: false,
          };
        }

        deps.emitEvent({
          type: 'billing_purchase_started',
          orderId: productId,
          driverId: activeDriver.driverId,
        });

        try {
          const tx = await activeDriver.purchase(productId, options);
          const outcome = await verifyAndMaybeFinish(
            activeDriver,
            tx,
            Boolean(options?.isConsumable),
          );

          deps.emitEvent({
            type: 'billing_purchase_settled',
            orderId: outcome.orderId,
            channelCode: outcome.channelCode,
            driverId: outcome.driverId,
            status: outcome.status,
            errorCode: outcome.errorCode,
            verifiedByServer: outcome.verifiedByServer,
          });

          return outcome;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Store purchase failed.';
          const isNotFound = message.includes('PRODUCT_NOT_FOUND');
          const isCancelled = message.toLowerCase().includes('cancel');
          const outcome: PaymentOutcome = {
            orderId: productId,
            channelCode: 'store_billing',
            driverId: activeDriver.driverId,
            status: isCancelled ? 'cancelled' : 'failed',
            errorCode: isCancelled ? 'CANCELLED' : isNotFound ? 'PRODUCT_NOT_FOUND' : 'UNKNOWN',
            message,
            verifiedByServer: false,
          };
          deps.emitEvent({
            type: 'billing_purchase_settled',
            orderId: outcome.orderId,
            channelCode: outcome.channelCode,
            driverId: outcome.driverId,
            status: outcome.status,
            errorCode: outcome.errorCode,
            verifiedByServer: false,
          });
          return outcome;
        }
      } finally {
        concurrencyLock.release();
      }
    },

    async restorePurchases(): Promise<PaymentOutcome[]> {
      if (!driver) {
        return [];
      }
      const activeDriver = driver;
      let transactions: StorePurchaseTransaction[];
      try {
        transactions = await activeDriver.restorePurchases();
      } catch {
        return [];
      }
      const outcomes: PaymentOutcome[] = [];
      for (const tx of transactions) {
        const outcome = await verifyAndMaybeFinish(activeDriver, tx, false);
        outcomes.push(outcome);
      }
      return outcomes;
    },

    dispose(): void {
      if (unsubscribeUnfinished) {
        unsubscribeUnfinished();
        unsubscribeUnfinished = null;
      }
      initialized = false;
      initPromise = null;
    },
  };
}

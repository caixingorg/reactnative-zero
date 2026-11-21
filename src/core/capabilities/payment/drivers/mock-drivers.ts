/**
 * @module core/capabilities/payment/drivers/mock-drivers
 * 职责：开发联调、Demo 演示与 CI 单测用的 Mock 一次性支付驱动与 Mock IAP/订阅驱动。
 */
import type {
  CheckoutDriver,
  DriverExecutionResult,
  PaymentExecutionIntent,
  StoreBillingDriver,
  StoreProduct,
  StoreProductType,
  StorePurchaseOptions,
  StorePurchaseTransaction,
} from '../types';

export interface MockCheckoutDriverOptions {
  driverId: string;
  available?: boolean;
  nextResult?: DriverExecutionResult;
  onInitialize?: () => void;
  execute?: (intent: PaymentExecutionIntent<unknown>) => Promise<DriverExecutionResult>;
}

export interface MockCheckoutDriver extends CheckoutDriver<unknown> {
  setAvailable(available: boolean): void;
  setNextResult(result: DriverExecutionResult): void;
}

export function createMockCheckoutDriver(options: MockCheckoutDriverOptions): MockCheckoutDriver {
  let available = options.available ?? true;
  let nextResult: DriverExecutionResult = options.nextResult ?? { status: 'completed' };

  return {
    driverId: options.driverId,
    async initialize(): Promise<void> {
      options.onInitialize?.();
    },
    async isAvailable(): Promise<boolean> {
      return available;
    },
    async execute(intent: PaymentExecutionIntent<unknown>): Promise<DriverExecutionResult> {
      if (options.execute) {
        return options.execute(intent);
      }
      return nextResult;
    },
    setAvailable(value: boolean): void {
      available = value;
    },
    setNextResult(result: DriverExecutionResult): void {
      nextResult = result;
    },
  };
}

export interface MockBillingDriverOptions {
  driverId?: string;
  available?: boolean;
  products?: StoreProduct[];
  platform?: 'ios' | 'android';
  onInitialize?: () => void;
  onSubscribeUnfinished?: () => void;
  onFinishTransaction?: (tx: StorePurchaseTransaction, isConsumable: boolean) => void;
}

export interface MockStoreBillingDriver extends StoreBillingDriver {
  emitUnfinishedTransaction(tx: StorePurchaseTransaction): void;
}

export function createMockBillingDriver(
  options?: MockBillingDriverOptions,
): MockStoreBillingDriver {
  const driverId = options?.driverId ?? 'mock_billing';
  const available = options?.available ?? true;
  const products = options?.products ?? [];
  const platform = options?.platform ?? 'ios';
  const listeners = new Set<(tx: StorePurchaseTransaction) => void>();
  const purchasedHistory: StorePurchaseTransaction[] = [];
  let seq = 1;

  return {
    driverId,

    async initialize(): Promise<void> {
      options?.onInitialize?.();
    },

    async isAvailable(): Promise<boolean> {
      return available;
    },

    async fetchProducts(productIds: string[], type: StoreProductType): Promise<StoreProduct[]> {
      return products.filter(
        (product) => product.type === type && productIds.includes(product.productId),
      );
    },

    async purchase(
      productId: string,
      purchaseOptions?: StorePurchaseOptions,
    ): Promise<StorePurchaseTransaction> {
      const exists = products.some((item) => item.productId === productId);
      if (!exists) {
        throw new Error(`PRODUCT_NOT_FOUND:${productId}`);
      }
      const tx: StorePurchaseTransaction = {
        transactionId: `mock-tx-${seq++}`,
        productId,
        purchaseTokenOrReceipt: `mock-receipt-${productId}-${purchaseOptions?.appAccountToken ?? 'anon'}`,
        platform,
      };
      purchasedHistory.push(tx);
      return tx;
    },

    async restorePurchases(): Promise<StorePurchaseTransaction[]> {
      return [...purchasedHistory];
    },

    async finishTransaction(
      transaction: StorePurchaseTransaction,
      isConsumable: boolean,
    ): Promise<void> {
      options?.onFinishTransaction?.(transaction, isConsumable);
    },

    subscribeUnfinishedTransactions(listener: (tx: StorePurchaseTransaction) => void): () => void {
      listeners.add(listener);
      options?.onSubscribeUnfinished?.();
      return () => {
        listeners.delete(listener);
      };
    },

    emitUnfinishedTransaction(tx: StorePurchaseTransaction): void {
      for (const listener of listeners) {
        listener(tx);
      }
    },
  };
}

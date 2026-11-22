/**
 * @module core/capabilities/payment/drivers/expo-iap-driver
 * 职责：expo-iap（Apple StoreKit 2 / Google Play Billing）直连驱动适配器——支持自动续费订阅、一次性买断与恢复购买（零 SaaS 抽成）。
 * 边界：通过依赖注入接收 expo-iap API，模板默认不强绑原生 IAP 二进制，安装 expo-iap 后传入即可生效。
 */
import type {
  StoreBillingDriver,
  StoreProduct,
  StoreProductType,
  StorePurchaseOptions,
  StorePurchaseTransaction,
} from '../types';

export const EXPO_IAP_DRIVER_ID = 'expo_iap';

export interface ExpoIapRawProduct {
  id: string;
  title?: string;
  description?: string;
  displayPrice?: string;
  currency?: string;
  subscriptionPeriodUnitIOS?: string;
  introductoryPriceIOS?: string;
}

export interface ExpoIapRawPurchase {
  transactionId?: string;
  id?: string;
  productId: string;
  purchaseToken?: string;
  transactionReceipt?: string;
  jwsRepresentationIOS?: string;
  originalTransactionIdentifierIOS?: string;
}

export interface ExpoIapPurchaseError {
  code?: string;
  message?: string;
}

export interface ExpoIapBridge {
  initConnection(): Promise<boolean>;
  endConnection?(): Promise<boolean>;
  fetchProducts(request: {
    skus: string[];
    type?: 'in-app' | 'subs' | 'all';
  }): Promise<ExpoIapRawProduct[]>;
  requestPurchase(request: {
    request: {
      apple?: { sku: string; appAccountToken?: string };
      google?: { skus: string[]; obfuscatedAccountIdAndroid?: string };
    };
    type?: 'in-app' | 'subs';
  }): Promise<ExpoIapRawPurchase | ExpoIapRawPurchase[] | void>;
  getAvailablePurchases(): Promise<ExpoIapRawPurchase[]>;
  finishTransaction(params: {
    purchase: ExpoIapRawPurchase;
    isConsumable?: boolean;
  }): Promise<void>;
  purchaseUpdatedListener?(listener: (purchase: ExpoIapRawPurchase) => void): { remove(): void };
}

export interface ExpoIapBillingDriverOptions {
  driverId?: string;
  platform: 'ios' | 'android';
  sdk: ExpoIapBridge;
}

function mapProductTypeToExpoIap(type: StoreProductType): 'in-app' | 'subs' {
  return type === 'subscription' ? 'subs' : 'in-app';
}

function normalizeTransaction(
  raw: ExpoIapRawPurchase,
  platform: 'ios' | 'android',
): StorePurchaseTransaction {
  const transactionId = raw.transactionId ?? raw.id ?? `${raw.productId}-${Date.now()}`;
  const receipt =
    raw.jwsRepresentationIOS ?? raw.transactionReceipt ?? raw.purchaseToken ?? transactionId;

  return {
    transactionId,
    productId: raw.productId,
    purchaseTokenOrReceipt: receipt,
    platform,
    originalTransactionId: raw.originalTransactionIdentifierIOS,
  };
}

function isCancelledError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const err = error as ExpoIapPurchaseError;
  const code = (err.code ?? '').toLowerCase();
  const message = (err.message ?? '').toLowerCase();
  return (
    code.includes('cancel') ||
    code === 'e_user_cancelled' ||
    code === 'user-cancelled' ||
    message.includes('cancel')
  );
}

export function createExpoIapBillingDriver(
  options: ExpoIapBillingDriverOptions,
): StoreBillingDriver {
  const driverId = options.driverId ?? EXPO_IAP_DRIVER_ID;
  const rawPurchaseMap = new Map<string, ExpoIapRawPurchase>();
  const productTypeMap = new Map<string, StoreProductType>();
  let connected = false;

  const rememberPurchase = (raw: ExpoIapRawPurchase): StorePurchaseTransaction => {
    const tx = normalizeTransaction(raw, options.platform);
    rawPurchaseMap.set(tx.transactionId, raw);
    return tx;
  };

  return {
    driverId,

    async initialize(): Promise<void> {
      if (connected) {
        return;
      }
      connected = await options.sdk.initConnection();
    },

    async isAvailable(): Promise<boolean> {
      if (connected) {
        return true;
      }
      try {
        connected = await options.sdk.initConnection();
        return connected;
      } catch {
        return false;
      }
    },

    async fetchProducts(productIds: string[], type: StoreProductType): Promise<StoreProduct[]> {
      if (productIds.length === 0) {
        return [];
      }
      const rawProducts = await options.sdk.fetchProducts({
        skus: productIds,
        type: mapProductTypeToExpoIap(type),
      });

      return rawProducts.map((item) => {
        productTypeMap.set(item.id, type);
        return {
          productId: item.id,
          type,
          title: item.title ?? item.id,
          description: item.description ?? '',
          localizedPrice: item.displayPrice ?? '',
          currencyCode: item.currency ?? '',
          subscriptionPeriod: item.subscriptionPeriodUnitIOS,
          introductoryPrice: item.introductoryPriceIOS,
        };
      });
    },

    async purchase(
      productId: string,
      purchaseOptions?: StorePurchaseOptions,
    ): Promise<StorePurchaseTransaction> {
      const knownType = productTypeMap.get(productId);
      const requestType: 'in-app' | 'subs' = knownType === 'subscription' ? 'subs' : 'in-app';

      try {
        const result = await options.sdk.requestPurchase({
          type: requestType,
          request: {
            apple: {
              sku: productId,
              appAccountToken: purchaseOptions?.appAccountToken,
            },
            google: {
              skus: [productId],
              obfuscatedAccountIdAndroid: purchaseOptions?.appAccountToken,
            },
          },
        });

        const first = Array.isArray(result) ? result[0] : result;
        if (!first) {
          throw new Error(`PRODUCT_NOT_FOUND: No transaction returned for ${productId}`);
        }
        return rememberPurchase(first);
      } catch (error: unknown) {
        if (isCancelledError(error)) {
          throw new Error('Purchase cancelled by user.');
        }
        throw error instanceof Error ? error : new Error('Store purchase failed.');
      }
    },

    async restorePurchases(): Promise<StorePurchaseTransaction[]> {
      const purchases = await options.sdk.getAvailablePurchases();
      return purchases.map(rememberPurchase);
    },

    async finishTransaction(
      transaction: StorePurchaseTransaction,
      isConsumable: boolean,
    ): Promise<void> {
      const raw = rawPurchaseMap.get(transaction.transactionId) ?? {
        transactionId: transaction.transactionId,
        productId: transaction.productId,
        purchaseToken: transaction.purchaseTokenOrReceipt,
        transactionReceipt: transaction.purchaseTokenOrReceipt,
      };
      await options.sdk.finishTransaction({ purchase: raw, isConsumable });
      rawPurchaseMap.delete(transaction.transactionId);
    },

    subscribeUnfinishedTransactions(
      listener: (transaction: StorePurchaseTransaction) => void,
    ): () => void {
      if (!options.sdk.purchaseUpdatedListener) {
        return () => {};
      }
      const subscription = options.sdk.purchaseUpdatedListener((raw) => {
        listener(rememberPurchase(raw));
      });
      return () => {
        subscription.remove();
      };
    },
  };
}

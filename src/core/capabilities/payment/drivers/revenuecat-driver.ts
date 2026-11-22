/**
 * @module core/capabilities/payment/drivers/revenuecat-driver
 * 职责：RevenueCat (react-native-purchases) 驱动适配器——托管 iOS + Google Play 订阅、永久买断与跨设备恢复购买（免自建收据服务器）。
 * 边界：通过依赖注入接收 Purchases SDK 实例，模板默认不强绑 react-native-purchases 原生二进制。
 */
import type {
  StoreBillingDriver,
  StoreProduct,
  StoreProductType,
  StorePurchaseOptions,
  StorePurchaseTransaction,
} from '../types';

export const REVENUECAT_DRIVER_ID = 'revenuecat_iap';

export interface RevenueCatStoreProduct {
  identifier: string;
  title?: string;
  description?: string;
  priceString?: string;
  currencyCode?: string;
  subscriptionPeriod?: string | null;
}

export interface RevenueCatEntitlementInfo {
  productIdentifier?: string;
  latestPurchaseDate?: string;
  originalPurchaseDate?: string;
}

export interface RevenueCatCustomerInfo {
  originalAppUserId?: string;
  activeSubscriptions?: string[];
  allPurchasedProductIdentifiers?: string[];
  entitlements?: {
    active?: Record<string, RevenueCatEntitlementInfo>;
  };
}

export interface RevenueCatPurchaseResult {
  productIdentifier?: string;
  customerInfo: RevenueCatCustomerInfo;
  transaction?: {
    transactionIdentifier?: string;
    productIdentifier?: string;
    purchaseDate?: string;
  };
}

export interface RevenueCatError {
  code?: string | number;
  userCancelled?: boolean;
  message?: string;
}

export interface RevenueCatBridge {
  configure(config: { apiKey: string; appUserID?: string }): void | Promise<void>;
  logIn?(appUserID: string): Promise<{ customerInfo: RevenueCatCustomerInfo }>;
  getProducts(productIdentifiers: string[], type?: string): Promise<RevenueCatStoreProduct[]>;
  purchaseStoreProduct(product: RevenueCatStoreProduct): Promise<RevenueCatPurchaseResult>;
  restorePurchases(): Promise<RevenueCatCustomerInfo>;
}

export interface RevenueCatBillingDriverOptions {
  driverId?: string;
  platform: 'ios' | 'android';
  apiKey: string;
  appUserId?: string;
  sdk: RevenueCatBridge;
}

function isRevenueCatCancelled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const err = error as RevenueCatError;
  if (err.userCancelled === true) {
    return true;
  }
  const code = String(err.code ?? '').toLowerCase();
  const message = (err.message ?? '').toLowerCase();
  return code.includes('cancel') || message.includes('cancel');
}

function buildTransactionsFromCustomerInfo(
  info: RevenueCatCustomerInfo,
  platform: 'ios' | 'android',
): StorePurchaseTransaction[] {
  const productIds = new Set<string>();
  for (const id of info.activeSubscriptions ?? []) {
    productIds.add(id);
  }
  for (const id of info.allPurchasedProductIdentifiers ?? []) {
    productIds.add(id);
  }
  for (const entitlement of Object.values(info.entitlements?.active ?? {})) {
    if (entitlement.productIdentifier) {
      productIds.add(entitlement.productIdentifier);
    }
  }

  return Array.from(productIds).map((productId) => ({
    transactionId: `rc-${productId}-${info.originalAppUserId ?? 'anon'}`,
    productId,
    purchaseTokenOrReceipt: info.originalAppUserId ?? productId,
    platform,
  }));
}

export function createRevenueCatBillingDriver(
  options: RevenueCatBillingDriverOptions,
): StoreBillingDriver {
  const driverId = options.driverId ?? REVENUECAT_DRIVER_ID;
  const cachedProducts = new Map<string, RevenueCatStoreProduct>();
  let configured = false;

  const ensureConfigured = async (): Promise<void> => {
    if (configured) {
      return;
    }
    await options.sdk.configure({
      apiKey: options.apiKey,
      appUserID: options.appUserId,
    });
    configured = true;
  };

  return {
    driverId,

    async initialize(): Promise<void> {
      await ensureConfigured();
    },

    async isAvailable(): Promise<boolean> {
      if (!options.apiKey.trim()) {
        return false;
      }
      try {
        await ensureConfigured();
        return true;
      } catch {
        return false;
      }
    },

    async fetchProducts(productIds: string[], type: StoreProductType): Promise<StoreProduct[]> {
      await ensureConfigured();
      if (productIds.length === 0) {
        return [];
      }
      const rcType = type === 'subscription' ? 'subs' : 'non_subscription';
      const items = await options.sdk.getProducts(productIds, rcType);

      return items.map((item) => {
        cachedProducts.set(item.identifier, item);
        return {
          productId: item.identifier,
          type,
          title: item.title ?? item.identifier,
          description: item.description ?? '',
          localizedPrice: item.priceString ?? '',
          currencyCode: item.currencyCode ?? '',
          subscriptionPeriod: item.subscriptionPeriod ?? undefined,
        };
      });
    },

    async purchase(
      productId: string,
      purchaseOptions?: StorePurchaseOptions,
    ): Promise<StorePurchaseTransaction> {
      await ensureConfigured();
      if (purchaseOptions?.appAccountToken && options.sdk.logIn) {
        await options.sdk.logIn(purchaseOptions.appAccountToken);
      }

      let product = cachedProducts.get(productId);
      if (!product) {
        const fetched = await options.sdk.getProducts([productId]);
        product = fetched.find((p) => p.identifier === productId);
        if (product) {
          cachedProducts.set(product.identifier, product);
        }
      }
      if (!product) {
        throw new Error(`PRODUCT_NOT_FOUND: Product ${productId} not found in RevenueCat.`);
      }

      try {
        const res = await options.sdk.purchaseStoreProduct(product);
        const txId =
          res.transaction?.transactionIdentifier ??
          `rc-${productId}-${res.customerInfo.originalAppUserId ?? Date.now()}`;

        return {
          transactionId: txId,
          productId: res.productIdentifier ?? res.transaction?.productIdentifier ?? productId,
          purchaseTokenOrReceipt: res.customerInfo.originalAppUserId ?? txId,
          platform: options.platform,
        };
      } catch (error: unknown) {
        if (isRevenueCatCancelled(error)) {
          throw new Error('Purchase cancelled by user.');
        }
        throw error instanceof Error ? error : new Error('RevenueCat purchase failed.');
      }
    },

    async restorePurchases(): Promise<StorePurchaseTransaction[]> {
      await ensureConfigured();
      const customerInfo = await options.sdk.restorePurchases();
      return buildTransactionsFromCustomerInfo(customerInfo, options.platform);
    },

    async finishTransaction(): Promise<void> {
      // 原因：RevenueCat SDK 内部已自动完成 StoreKit / Play Billing 的 finishTransaction，此处幂等返回以适配统一验单闸门
    },

    subscribeUnfinishedTransactions(): () => void {
      return () => {};
    },
  };
}

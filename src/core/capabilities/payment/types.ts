/**
 * @module core/capabilities/payment/types
 * 职责：定义全场景可插拔支付能力的公共类型契约（一次性支付、二级聚合路由、IAP/订阅、持久化恢复与服务端验单）。
 * 边界：纯 TypeScript 类型与常量，零 React Native / 第三方支付 SDK 依赖，可独立抽离开源。
 */
import type { KeyValueStorageDriver } from '../../storage/types';

export type PaymentErrorCode =
  | 'CANCELLED'
  | 'PAYMENT_IN_PROGRESS'
  | 'DRIVER_NOT_REGISTERED'
  | 'APP_NOT_INSTALLED'
  | 'NOT_SUPPORTED'
  | 'INVALID_PAYLOAD'
  | 'NETWORK_ERROR'
  | 'VERIFY_TIMEOUT'
  | 'ORDER_EXPIRED'
  | 'STORE_BILLING_UNAVAILABLE'
  | 'PRODUCT_NOT_FOUND'
  | 'RECEIPT_VERIFY_FAILED'
  | 'UNKNOWN';

export type PaymentStatus = 'succeeded' | 'cancelled' | 'pending' | 'failed';

export type PaymentAppState = 'active' | 'background' | 'inactive';

export interface PaymentAppStateWatcher {
  getCurrentState(): PaymentAppState;
  subscribe(listener: (nextState: PaymentAppState) => void): () => void;
}

export interface PaymentOutcome {
  orderId: string;
  driverId: string;
  channelCode: string;
  status: PaymentStatus;
  errorCode?: PaymentErrorCode;
  rawCode?: string;
  message?: string;
  verifiedByServer: boolean;
}

export interface RemotePaymentChannel {
  channelCode: string;
  driverId: string;
  displayName: string;
  subtitle?: string;
  iconKey?: string;
  gatewayTag?: string;
  unavailablePolicy?: 'hide' | 'disable';
}

export interface ResolvedPaymentChannel extends RemotePaymentChannel {
  available: boolean;
  unavailableReason?: 'DRIVER_NOT_REGISTERED' | 'APP_NOT_INSTALLED' | 'NOT_SUPPORTED';
}

export interface PaymentExecutionIntent<TPayload = unknown> {
  orderId: string;
  channelCode: string;
  driverId: string;
  payload: TPayload;
  expiresAt?: number;
}

export interface DriverExecutionResult {
  status: 'completed' | 'cancelled' | 'pending' | 'failed';
  errorCode?: PaymentErrorCode;
  rawCode?: string;
  message?: string;
}

export interface CheckoutDriverExecuteOptions {
  signal?: AbortSignal;
}

export interface CheckoutDriver<TPayload = unknown> {
  readonly driverId: string;
  initialize?(): Promise<void>;
  isAvailable(): Promise<boolean>;
  execute(
    intent: PaymentExecutionIntent<TPayload>,
    options?: CheckoutDriverExecuteOptions,
  ): Promise<DriverExecutionResult>;
}

export type StoreProductType = 'consumable' | 'non_consumable' | 'subscription';

export interface StoreProduct {
  productId: string;
  type: StoreProductType;
  title: string;
  description: string;
  localizedPrice: string;
  currencyCode: string;
  subscriptionPeriod?: string;
  introductoryPrice?: string;
}

export interface StorePurchaseTransaction {
  transactionId: string;
  productId: string;
  purchaseTokenOrReceipt: string;
  platform: 'ios' | 'android';
  originalTransactionId?: string;
}

export interface StorePurchaseOptions {
  appAccountToken?: string;
  isConsumable?: boolean;
}

export interface StoreBillingDriver {
  readonly driverId: string;
  initialize(): Promise<void>;
  isAvailable(): Promise<boolean>;
  fetchProducts(productIds: string[], type: StoreProductType): Promise<StoreProduct[]>;
  purchase(productId: string, options?: StorePurchaseOptions): Promise<StorePurchaseTransaction>;
  restorePurchases(): Promise<StorePurchaseTransaction[]>;
  finishTransaction(transaction: StorePurchaseTransaction, isConsumable: boolean): Promise<void>;
  subscribeUnfinishedTransactions(listener: (tx: StorePurchaseTransaction) => void): () => void;
}

export type ServerVerifyStatus = 'paid' | 'pending' | 'failed' | 'expired';

export interface ServerOrderVerifier {
  verifyCheckoutOrder(orderId: string): Promise<{
    status: ServerVerifyStatus;
    message?: string;
  }>;
  verifyStoreTransaction?(tx: StorePurchaseTransaction): Promise<{
    verified: boolean;
    shouldFinishTransaction: boolean;
    isConsumable?: boolean;
    orderId?: string;
    message?: string;
  }>;
}

export interface PendingCheckoutSession {
  orderId: string;
  channelCode: string;
  driverId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export type PaymentEventType =
  | 'drivers_initialized'
  | 'checkout_started'
  | 'checkout_foreground_fallback'
  | 'checkout_settled'
  | 'checkout_recovered'
  | 'billing_purchase_started'
  | 'billing_purchase_settled'
  | 'billing_unfinished_recovered';

// 原因：所有可观测事件强制仅保留非敏感元信息，杜绝签名串、支付令牌或商店收据原文进入日志与 DevTools
export interface PaymentEvent {
  type: PaymentEventType;
  orderId?: string;
  channelCode?: string;
  driverId?: string;
  status?: PaymentStatus;
  errorCode?: PaymentErrorCode;
  verifiedByServer?: boolean;
  timestamp: number;
}

export interface CheckoutPayOptions {
  userId: string;
}

export interface RecoverSessionsOptions {
  userId: string;
}

export interface CreatePaymentServiceOptions {
  keyValueStorage: KeyValueStorageDriver;
  verifier: ServerOrderVerifier;
  checkoutDrivers?: readonly CheckoutDriver[];
  billingDriver?: StoreBillingDriver;
  appStateWatcher?: PaymentAppStateWatcher;
  foregroundGraceMs?: number;
  defaultSessionTtlMs?: number;
  pollBackoffMs?: readonly number[];
  now?: () => number;
  onEvent?: (event: PaymentEvent) => void;
}

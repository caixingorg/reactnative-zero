/**
 * @module core/capabilities/payment
 * 职责：全场景可插拔支付能力的公开出口（纯 TS Headless 引擎 + 内置零原生驱动 + React Native AppState 适配工具）。
 */
import { AppState } from 'react-native';
import type { PaymentService } from './payment-service';
import type { PaymentAppState, PaymentAppStateWatcher } from './types';

export {
  createStoreBillingCoordinator,
  type StoreBillingCoordinator,
  type StoreBillingCoordinatorDeps,
} from './billing-coordinator';
export {
  createCheckoutCoordinator,
  type CheckoutCoordinator,
  type CheckoutCoordinatorDeps,
} from './checkout-coordinator';
export {
  createMockBillingDriver,
  createMockCheckoutDriver,
  type MockBillingDriverOptions,
  type MockCheckoutDriver,
  type MockCheckoutDriverOptions,
  type MockStoreBillingDriver,
} from './drivers/mock-drivers';
export {
  createWebCheckoutDriver,
  WEB_CHECKOUT_DRIVER_ID,
  type WebCheckoutDriverOptions,
  type WebCheckoutPayload,
} from './drivers/web-checkout-driver';
export { createZeroAmountDriver, ZERO_AMOUNT_DRIVER_ID } from './drivers/zero-amount-driver';
export { createPaymentService, type PaymentService } from './payment-service';
export { createPendingSessionStore, type PendingSessionStore } from './pending-session-store';
export type {
  CheckoutDriver,
  CheckoutDriverExecuteOptions,
  CheckoutPayOptions,
  CreatePaymentServiceOptions,
  DriverExecutionResult,
  PaymentAppState,
  PaymentAppStateWatcher,
  PaymentErrorCode,
  PaymentEvent,
  PaymentEventType,
  PaymentExecutionIntent,
  PaymentOutcome,
  PaymentStatus,
  PendingCheckoutSession,
  RecoverSessionsOptions,
  RemotePaymentChannel,
  ResolvedPaymentChannel,
  ServerOrderVerifier,
  ServerVerifyStatus,
  StoreBillingDriver,
  StoreProduct,
  StoreProductType,
  StorePurchaseOptions,
  StorePurchaseTransaction,
} from './types';

declare module '../../runtime/app-runtime' {
  interface CapabilityOverrideMap {
    paymentService?: PaymentService;
  }
}

function normalizeAppState(state: string | null | undefined): PaymentAppState {
  if (state === 'active' || state === 'background' || state === 'inactive') {
    return state;
  }
  return 'background';
}

// 原因：将 React Native 原生 AppState 适配为纯接口，使核心支付引擎保持零 RN 强耦合、可随时独立开源或单测
export function createReactNativeAppStateWatcher(): PaymentAppStateWatcher {
  return {
    getCurrentState(): PaymentAppState {
      return normalizeAppState(AppState.currentState);
    },
    subscribe(listener: (nextState: PaymentAppState) => void): () => void {
      const subscription = AppState.addEventListener('change', (nextState) => {
        listener(normalizeAppState(nextState));
      });
      return () => {
        subscription.remove();
      };
    },
  };
}

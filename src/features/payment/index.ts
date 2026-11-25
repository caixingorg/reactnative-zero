/**
 * @module features/payment
 * 职责：支付与会员订阅业务切片，提供可复用收银台弹窗与结账页面。
 */
export {
  createCheckoutSandboxVerifier,
  createSandboxFallbackDrivers,
  getSandboxCheckoutFixtures,
  type SandboxCheckoutFixtures,
} from './checkout-sandbox';
export {
  PaymentCashierSheet,
  type PaymentCashierSheetProps,
} from './components/PaymentCashierSheet';
export { CheckoutScreen, type CheckoutScreenProps } from './screens/CheckoutScreen';

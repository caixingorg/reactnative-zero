/**
 * @module core/capabilities/payment/drivers/stripe-driver
 * 职责：Stripe PaymentSheet 驱动适配器——一套覆盖国际银行卡、Apple Pay、Google Pay 与 PayPal（海外主体）。
 * 边界：通过依赖注入接收 @stripe/stripe-react-native 的 init/present 方法，模板默认不强绑 Stripe 原生二进制。
 */
import type { CheckoutDriver, DriverExecutionResult, PaymentExecutionIntent } from '../types';

export const STRIPE_DRIVER_ID = 'stripe_sheet';

export interface StripeCheckoutPayload {
  paymentIntentClientSecret: string;
  merchantDisplayName: string;
  customerId?: string;
  customerEphemeralKeySecret?: string;
  applePayMerchantCountryCode?: string;
  googlePayMerchantCountryCode?: string;
  googlePayTestEnv?: boolean;
  returnURL?: string;
}

export interface StripeSheetError {
  code?: string;
  message?: string;
}

export interface StripeSdkBridge {
  initPaymentSheet(payload: StripeCheckoutPayload): Promise<{ error?: StripeSheetError }>;
  presentPaymentSheet(): Promise<{ error?: StripeSheetError }>;
  isSupported?(): Promise<boolean>;
}

export interface StripeCheckoutDriverOptions {
  driverId?: string;
  sdk: StripeSdkBridge;
}

function isStripePayload(payload: unknown): payload is StripeCheckoutPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const c = payload as Record<string, unknown>;
  return (
    typeof c.paymentIntentClientSecret === 'string' &&
    c.paymentIntentClientSecret.trim().length > 0 &&
    typeof c.merchantDisplayName === 'string' &&
    c.merchantDisplayName.trim().length > 0
  );
}

function normalizeStripeError(error: StripeSheetError): DriverExecutionResult {
  const code = (error.code ?? '').toLowerCase();
  if (code === 'canceled' || code === 'cancelled') {
    return {
      status: 'cancelled',
      errorCode: 'CANCELLED',
      rawCode: error.code,
      message: error.message ?? 'User cancelled Stripe PaymentSheet.',
    };
  }
  return {
    status: 'failed',
    errorCode: 'UNKNOWN',
    rawCode: error.code,
    message: error.message ?? 'Stripe PaymentSheet failed.',
  };
}

export function createStripeCheckoutDriver(
  options: StripeCheckoutDriverOptions,
): CheckoutDriver<StripeCheckoutPayload> {
  const driverId = options.driverId ?? STRIPE_DRIVER_ID;

  return {
    driverId,

    async isAvailable(): Promise<boolean> {
      if (!options.sdk.isSupported) {
        return true;
      }
      try {
        return await options.sdk.isSupported();
      } catch {
        return false;
      }
    },

    async execute(
      intent: PaymentExecutionIntent<StripeCheckoutPayload>,
    ): Promise<DriverExecutionResult> {
      if (!isStripePayload(intent.payload)) {
        return {
          status: 'failed',
          errorCode: 'INVALID_PAYLOAD',
          message: 'Stripe checkout requires paymentIntentClientSecret and merchantDisplayName.',
        };
      }

      const initRes = await options.sdk.initPaymentSheet(intent.payload);
      if (initRes.error) {
        return normalizeStripeError(initRes.error);
      }

      const presentRes = await options.sdk.presentPaymentSheet();
      if (presentRes.error) {
        return normalizeStripeError(presentRes.error);
      }

      return { status: 'completed' };
    },
  };
}

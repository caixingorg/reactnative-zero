/**
 * @module core/capabilities/payment/drivers/web-checkout-driver
 * 职责：内置通用 Web / H5 收银台驱动（覆盖 PayPal Checkout 与绝大多数二级聚合支付 H5 跳转回跳，零新增原生依赖）。
 */
import * as Linking from 'expo-linking';
import type {
  CheckoutDriver,
  CheckoutDriverExecuteOptions,
  DriverExecutionResult,
  PaymentExecutionIntent,
} from '../types';

export const WEB_CHECKOUT_DRIVER_ID = 'web_checkout';

export interface WebCheckoutPayload {
  checkoutUrl: string;
  returnUrlPrefix: string;
}

export interface WebCheckoutDriverOptions {
  driverId?: string;
  openUrl?: (url: string) => Promise<void>;
  subscribeUrl?: (listener: (url: string) => void) => () => void;
}

// 原因：严格校验 H5 收银台链接必须为 https 协议，拦截 javascript:/file:/自定义伪协议注入 Linking.openURL
function isSafeHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isWebCheckoutPayload(payload: unknown): payload is WebCheckoutPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.checkoutUrl === 'string' &&
    isSafeHttpsUrl(candidate.checkoutUrl.trim()) &&
    typeof candidate.returnUrlPrefix === 'string' &&
    candidate.returnUrlPrefix.trim().length > 0
  );
}

function parseReturnStatus(url: string): 'completed' | 'cancelled' | 'failed' {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) {
    return 'completed';
  }
  const search = url.slice(queryStart + 1);
  const params = new URLSearchParams(search);
  const status = (params.get('status') ?? '').toLowerCase();
  if (status === 'cancel' || status === 'cancelled' || status === 'canceled') {
    return 'cancelled';
  }
  if (status === 'fail' || status === 'failed' || status === 'error') {
    return 'failed';
  }
  return 'completed';
}

export function createWebCheckoutDriver(
  options?: WebCheckoutDriverOptions,
): CheckoutDriver<WebCheckoutPayload> {
  const driverId = options?.driverId ?? WEB_CHECKOUT_DRIVER_ID;
  const openUrl =
    options?.openUrl ??
    (async (url: string) => {
      await Linking.openURL(url);
    });
  const subscribeUrl =
    options?.subscribeUrl ??
    ((listener: (url: string) => void) => {
      const sub = Linking.addEventListener('url', ({ url }) => {
        listener(url);
      });
      return () => {
        sub.remove();
      };
    });

  return {
    driverId,

    async isAvailable(): Promise<boolean> {
      return true;
    },

    async execute(
      intent: PaymentExecutionIntent<WebCheckoutPayload>,
      executeOptions?: CheckoutDriverExecuteOptions,
    ): Promise<DriverExecutionResult> {
      if (!isWebCheckoutPayload(intent.payload)) {
        return {
          status: 'failed',
          errorCode: 'INVALID_PAYLOAD',
          message: 'Web checkout requires a valid https checkoutUrl and returnUrlPrefix.',
        };
      }

      const { checkoutUrl, returnUrlPrefix } = intent.payload;
      const signal = executeOptions?.signal;

      if (signal?.aborted) {
        return { status: 'cancelled', errorCode: 'CANCELLED', message: 'Checkout aborted.' };
      }

      return new Promise<DriverExecutionResult>((resolve) => {
        let settled = false;

        const finish = (result: DriverExecutionResult): void => {
          if (settled) {
            return;
          }
          settled = true;
          unsubscribe();
          signal?.removeEventListener('abort', onAbort);
          resolve(result);
        };

        const onAbort = (): void => {
          finish({ status: 'pending' });
        };

        const unsubscribe = subscribeUrl((incomingUrl) => {
          if (settled || !incomingUrl.startsWith(returnUrlPrefix)) {
            return;
          }
          const parsed = parseReturnStatus(incomingUrl);
          if (parsed === 'cancelled') {
            finish({
              status: 'cancelled',
              errorCode: 'CANCELLED',
              message: 'User cancelled web checkout.',
            });
            return;
          }
          if (parsed === 'failed') {
            finish({
              status: 'failed',
              errorCode: 'UNKNOWN',
              message: 'Web checkout returned failure.',
            });
            return;
          }
          finish({ status: 'completed' });
        });

        signal?.addEventListener('abort', onAbort);

        void openUrl(checkoutUrl).catch((error: unknown) => {
          finish({
            status: 'failed',
            errorCode: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Failed to open checkout URL.',
          });
        });
      });
    },
  };
}

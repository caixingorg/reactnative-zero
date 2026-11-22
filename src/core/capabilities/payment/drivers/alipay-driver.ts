/**
 * @module core/capabilities/payment/drivers/alipay-driver
 * 职责：支付宝 App 支付驱动适配器——将支付宝官方文档同步返回码（9000/8000/6001/6002/6004 等）归一化为统一 DriverExecutionResult。
 * 边界：通过依赖注入接收原生桥接函数，不直接硬耦合原生模块，保持 core/capabilities/payment 可单测与可独立开源。
 */
import type { CheckoutDriver, DriverExecutionResult, PaymentExecutionIntent } from '../types';

export const ALIPAY_DRIVER_ID = 'alipay_sdk';

export interface AlipayCheckoutPayload {
  orderInfo: string;
  sandbox?: boolean;
  iosScheme?: string;
}

export interface AlipayNativeResult {
  resultStatus: string;
  result?: string;
  memo?: string;
}

export interface AlipayCheckoutDriverOptions {
  driverId?: string;
  isLinked?: () => boolean;
  nativePay: (payload: AlipayCheckoutPayload) => Promise<AlipayNativeResult>;
}

function isAlipayPayload(payload: unknown): payload is AlipayCheckoutPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return typeof candidate.orderInfo === 'string' && candidate.orderInfo.trim().length > 0;
}

// 原因：严格遵循支付宝开放平台 App 支付同步返回码规范；9000 仅映射为 completed 触发后端二次查单，绝不直接作为最终发货依据
export function normalizeAlipayResult(raw: AlipayNativeResult): DriverExecutionResult {
  const code = raw.resultStatus.trim();
  if (code === '9000') {
    return { status: 'completed', rawCode: code, message: raw.memo || undefined };
  }
  if (code === '8000' || code === '6004') {
    return { status: 'pending', rawCode: code, message: raw.memo || 'Alipay payment processing.' };
  }
  if (code === '6001') {
    return {
      status: 'cancelled',
      errorCode: 'CANCELLED',
      rawCode: code,
      message: raw.memo || 'User cancelled Alipay payment.',
    };
  }
  if (code === '6002') {
    return {
      status: 'failed',
      errorCode: 'NETWORK_ERROR',
      rawCode: code,
      message: raw.memo || 'Alipay network error.',
    };
  }
  return {
    status: 'failed',
    errorCode: 'UNKNOWN',
    rawCode: code || undefined,
    message: raw.memo || `Alipay returned status ${code || 'unknown'}.`,
  };
}

export function createAlipayCheckoutDriver(
  options: AlipayCheckoutDriverOptions,
): CheckoutDriver<AlipayCheckoutPayload> {
  const driverId = options.driverId ?? ALIPAY_DRIVER_ID;

  return {
    driverId,

    // 原因：支付宝官方 SDK 内部在未安装支付宝客户端时自动降级为内置 H5 收银台，因此只要原生模块已链接即恒为可用
    async isAvailable(): Promise<boolean> {
      return options.isLinked ? options.isLinked() : true;
    },

    async execute(
      intent: PaymentExecutionIntent<AlipayCheckoutPayload>,
    ): Promise<DriverExecutionResult> {
      if (!isAlipayPayload(intent.payload)) {
        return {
          status: 'failed',
          errorCode: 'INVALID_PAYLOAD',
          message: 'Alipay checkout requires a non-empty server-signed orderInfo string.',
        };
      }

      const raw = await options.nativePay(intent.payload);
      return normalizeAlipayResult(raw);
    },
  };
}

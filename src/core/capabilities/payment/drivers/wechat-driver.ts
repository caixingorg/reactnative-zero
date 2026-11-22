/**
 * @module core/capabilities/payment/drivers/wechat-driver
 * 职责：微信 App 支付驱动适配器——封装微信 OpenSDK 注册、安装检测与返回码归一化（0 成功触发查单 / -2 取消 / -1 失败 / -99 未安装）。
 */
import type { CheckoutDriver, DriverExecutionResult, PaymentExecutionIntent } from '../types';

export const WECHAT_DRIVER_ID = 'wechat_sdk';

export interface WechatCheckoutPayload {
  appId: string;
  partnerId: string;
  prepayId: string;
  packageValue?: string;
  nonceStr: string;
  timeStamp: string;
  sign: string;
}

export interface WechatNativeResult {
  errCode: number;
  errStr?: string;
}

export interface WechatCheckoutDriverOptions {
  driverId?: string;
  appId?: string;
  universalLink?: string;
  registerApp?: (appId: string, universalLink: string) => Promise<boolean>;
  isInstalled: () => Promise<boolean>;
  nativePay: (payload: WechatCheckoutPayload) => Promise<WechatNativeResult>;
}

function isWechatPayload(payload: unknown): payload is WechatCheckoutPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const c = payload as Record<string, unknown>;
  return (
    typeof c.appId === 'string' &&
    c.appId.trim().length > 0 &&
    typeof c.partnerId === 'string' &&
    c.partnerId.trim().length > 0 &&
    typeof c.prepayId === 'string' &&
    c.prepayId.trim().length > 0 &&
    typeof c.nonceStr === 'string' &&
    c.nonceStr.trim().length > 0 &&
    typeof c.timeStamp === 'string' &&
    c.timeStamp.trim().length > 0 &&
    typeof c.sign === 'string' &&
    c.sign.trim().length > 0
  );
}

// 原因：遵循微信支付 OpenSDK 错误码规范：0 仅触发后端查单，-2 为用户取消，-99 为本地未安装微信
export function normalizeWechatResult(raw: WechatNativeResult): DriverExecutionResult {
  if (raw.errCode === 0) {
    return { status: 'completed', rawCode: '0', message: raw.errStr || undefined };
  }
  if (raw.errCode === -2) {
    return {
      status: 'cancelled',
      errorCode: 'CANCELLED',
      rawCode: '-2',
      message: raw.errStr || 'User cancelled WeChat Pay.',
    };
  }
  if (raw.errCode === -99) {
    return {
      status: 'failed',
      errorCode: 'APP_NOT_INSTALLED',
      rawCode: '-99',
      message: raw.errStr || 'WeChat app is not installed.',
    };
  }
  return {
    status: 'failed',
    errorCode: 'UNKNOWN',
    rawCode: String(raw.errCode),
    message: raw.errStr || `WeChat Pay failed with errCode ${raw.errCode}.`,
  };
}

export function createWechatCheckoutDriver(
  options: WechatCheckoutDriverOptions,
): CheckoutDriver<WechatCheckoutPayload> {
  const driverId = options.driverId ?? WECHAT_DRIVER_ID;

  return {
    driverId,

    async initialize(): Promise<void> {
      if (options.registerApp && options.appId) {
        await options.registerApp(options.appId, options.universalLink ?? '');
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        return await options.isInstalled();
      } catch {
        return false;
      }
    },

    async execute(
      intent: PaymentExecutionIntent<WechatCheckoutPayload>,
    ): Promise<DriverExecutionResult> {
      if (!isWechatPayload(intent.payload)) {
        return {
          status: 'failed',
          errorCode: 'INVALID_PAYLOAD',
          message: 'WeChat Pay requires appId, partnerId, prepayId, nonceStr, timeStamp, and sign.',
        };
      }

      const raw = await options.nativePay(intent.payload);
      return normalizeWechatResult(raw);
    },
  };
}

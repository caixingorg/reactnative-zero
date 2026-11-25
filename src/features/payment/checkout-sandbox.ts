/**
 * @module features/payment/checkout-sandbox
 * 职责：非生产环境支付演示夹具、兜底 Mock 驱动与本地自动验单器。
 * 边界：APP_VARIANT=production 时由 metro.config.js 物理替换为 checkout-sandbox.prod.ts。
 */
import {
  ALIPAY_DRIVER_ID,
  createMockBillingDriver,
  createMockCheckoutDriver,
  WECHAT_DRIVER_ID,
  type CheckoutDriver,
  type ServerOrderVerifier,
  type StoreBillingDriver,
  type StoreProduct,
} from '@/core/capabilities/payment';

export interface SandboxCheckoutFixtures {
  alipayOrderInfo: string;
  webCheckoutUrl: string;
  wechatPayload: {
    appId: string;
    partnerId: string;
    prepayId: string;
    packageValue: string;
    nonceStr: string;
    timeStamp: string;
    sign: string;
  };
  iapProducts: StoreProduct[];
}

const SANDBOX_H5_CHECKOUT_URL = 'https://opendocs.alipay.com/open/204/105297';

// 原因：无真实商户签名串时仅用于真机验证能够成功拉起支付宝官方 SDK/收银台界面（支付宝会按规范提示订单参数无效）
const SAMPLE_ALIPAY_ORDER_INFO =
  'app_id=2021000000000000&biz_content=%7B%22out_trade_no%22%3A%22SANDBOX001%22%2C%22total_amount%22%3A%220.01%22%2C%22subject%22%3A%22Order%22%7D&charset=utf-8&method=alipay.trade.app.pay&sign_type=RSA2&timestamp=2026-01-01+00%3A00%3A00&version=1.0&sign=SANDBOX_SIGN';

const SANDBOX_IAP_PRODUCTS: StoreProduct[] = [
  {
    productId: 'pro_monthly',
    type: 'subscription',
    title: 'Pro 月度会员',
    description: '按月自动续费 · 支持随时取消与换机恢复',
    localizedPrice: '¥30.00 / 月',
    currencyCode: 'CNY',
    subscriptionPeriod: 'P1M',
  },
  {
    productId: 'pro_lifetime',
    type: 'non_consumable',
    title: 'Pro 永久买断',
    description: '一次购买永久解锁 · 含后续全量版本更新',
    localizedPrice: '¥198.00',
    currencyCode: 'CNY',
  },
];

export function createCheckoutSandboxVerifier(): ServerOrderVerifier {
  return {
    verifyCheckoutOrder: async () => ({ status: 'paid', message: '后端查单已确认付款' }),
    verifyStoreTransaction: async (tx) => ({
      verified: true,
      shouldFinishTransaction: true,
      orderId: `IAP-${tx.transactionId}`,
      message: '收据验真通过并已发放会员权益',
    }),
  };
}

export function getSandboxCheckoutFixtures(): SandboxCheckoutFixtures | null {
  return {
    alipayOrderInfo: SAMPLE_ALIPAY_ORDER_INFO,
    webCheckoutUrl: SANDBOX_H5_CHECKOUT_URL,
    wechatPayload: {
      appId: 'wx0000000000000000',
      partnerId: '1900000109',
      prepayId: 'wx2026sandboxprepayid',
      packageValue: 'Sign=WXPay',
      nonceStr: 'sandbox_nonce_123',
      timeStamp: String(Math.floor(Date.now() / 1000)),
      sign: 'SANDBOX_WECHAT_SIGN',
    },
    iapProducts: SANDBOX_IAP_PRODUCTS,
  };
}

export function createSandboxFallbackDrivers(options: {
  alipayLinked: boolean;
  wechatLinked: boolean;
}): {
  alipayDriver?: CheckoutDriver;
  wechatDriver?: CheckoutDriver;
  billingDriver?: StoreBillingDriver;
} {
  return {
    alipayDriver: options.alipayLinked
      ? undefined
      : createMockCheckoutDriver({
          driverId: ALIPAY_DRIVER_ID,
          available: true,
          nextResult: { status: 'completed' },
        }),
    wechatDriver: options.wechatLinked
      ? undefined
      : createMockCheckoutDriver({
          driverId: WECHAT_DRIVER_ID,
          available: false,
        }),
    billingDriver: createMockBillingDriver({
      driverId: 'mock_iap',
      products: SANDBOX_IAP_PRODUCTS,
    }),
  };
}

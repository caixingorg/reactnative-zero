import type {
  CheckoutDriver,
  ServerOrderVerifier,
  StoreBillingDriver,
} from '@/core/capabilities/payment';
import type { SandboxCheckoutFixtures } from './checkout-sandbox';

export type { SandboxCheckoutFixtures } from './checkout-sandbox';

// 原因：production 构建变体由 metro.config.js 将沙箱夹具与免签验单器解析至此空桩，杜绝模拟支付在正式包中返回已付款
export function createCheckoutSandboxVerifier(): ServerOrderVerifier {
  return {
    verifyCheckoutOrder: async () => {
      throw new Error(
        'Checkout sandbox verifier is physically stripped from production builds; configure a real backend verifier.',
      );
    },
    verifyStoreTransaction: async () => {
      throw new Error(
        'Store transaction sandbox verifier is physically stripped from production builds; configure a real backend verifier.',
      );
    },
  };
}

export function getSandboxCheckoutFixtures(): SandboxCheckoutFixtures | null {
  return null;
}

export function createSandboxFallbackDrivers(_options: {
  alipayLinked: boolean;
  wechatLinked: boolean;
}): {
  alipayDriver?: CheckoutDriver;
  wechatDriver?: CheckoutDriver;
  billingDriver?: StoreBillingDriver;
} {
  return {};
}

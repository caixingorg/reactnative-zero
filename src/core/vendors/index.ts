/**
 * @module core/vendors
 * 职责：定义需商户/第三方密钥的商业 SDK 适配器契约（三方登录、支付、外部地图、厂商推送）。
 * 边界：非生产环境提供免密钥 Mock 便于联调；生产环境未注入真实实现时必须抛错阻断，严禁静默返回假成功（见 ADR-0005）。
 */
import { useMemo } from 'react';
import { useAppRuntime } from '../runtime';

export type SocialAuthProvider = 'wechat' | 'apple' | 'google';
export type PaymentChannel = 'wechat_pay' | 'alipay' | 'iap';

export interface SocialAuthResult {
  provider: SocialAuthProvider;
  openId: string;
  authCode: string;
}

export interface SocialAuthAdapter {
  signInWithProvider(provider: SocialAuthProvider): Promise<SocialAuthResult>;
}

export interface PaymentCheckoutRequest {
  channel: PaymentChannel;
  orderId: string;
  amountCents: number;
}

export interface PaymentCheckoutResult {
  status: 'paid' | 'cancelled';
  transactionId: string;
}

/**
 * @deprecated 新业务收银台与订阅内购请优先使用 `@/core/capabilities/payment` 的 `PaymentService`（见 ADR-0008）；
 * 本接口仅作为轻量商业 SDK 适配器演示保留。
 */
export interface PaymentAdapter {
  checkoutOrder(request: PaymentCheckoutRequest): Promise<PaymentCheckoutResult>;
}

export interface MapDestination {
  label: string;
  latitude: number;
  longitude: number;
}

export interface MapNavigationAdapter {
  openExternalMapNavigation(
    destination: MapDestination,
  ): Promise<{ launched: boolean; provider: string }>;
}

export interface VendorPushAdapter {
  registerVendorPushChannel(): Promise<{ vendor: string; registrationId: string }>;
}

export interface CommercialVendorAdapters {
  socialAuth: SocialAuthAdapter;
  payment: PaymentAdapter;
  mapNavigation: MapNavigationAdapter;
  vendorPush: VendorPushAdapter;
}

export class VendorAdapterNotConfiguredError extends Error {
  public readonly adapterName: keyof CommercialVendorAdapters;

  constructor(adapterName: keyof CommercialVendorAdapters) {
    super(
      `Commercial vendor adapter "${adapterName}" is not configured for production. Inject a real implementation via createAppRuntime({ vendors }).`,
    );
    this.name = 'VendorAdapterNotConfiguredError';
    this.adapterName = adapterName;
  }
}

// 原因：生产环境严禁回退至“恒返回已支付/登录成功”的模拟实现，未显式注入真实商业 SDK 时立即抛错阻断资金与鉴权风险
export function createProductionUnconfiguredVendorAdapters(): CommercialVendorAdapters {
  return {
    socialAuth: {
      async signInWithProvider() {
        throw new VendorAdapterNotConfiguredError('socialAuth');
      },
    },
    payment: {
      async checkoutOrder() {
        throw new VendorAdapterNotConfiguredError('payment');
      },
    },
    mapNavigation: {
      async openExternalMapNavigation() {
        throw new VendorAdapterNotConfiguredError('mapNavigation');
      },
    },
    vendorPush: {
      async registerVendorPushChannel() {
        throw new VendorAdapterNotConfiguredError('vendorPush');
      },
    },
  };
}

// 原因：遵循 ADR-0005，非生产环境预置免商户密钥模拟实现，确保新克隆项目在申请下商户资质前即可零报错编译联调
export function createMockCommercialVendorAdapters(): CommercialVendorAdapters {
  return {
    socialAuth: {
      async signInWithProvider(provider) {
        return {
          provider,
          openId: `mock-openid-${provider}`,
          authCode: `mock-wx-code-${provider}`,
        };
      },
    },
    payment: {
      async checkoutOrder(request) {
        return {
          status: 'paid',
          transactionId: `mock-tx-${request.channel}-${request.orderId}`,
        };
      },
    },
    mapNavigation: {
      async openExternalMapNavigation(destination) {
        return {
          launched: true,
          provider: `mock-map(${destination.label})`,
        };
      },
    },
    vendorPush: {
      async registerVendorPushChannel() {
        return {
          vendor: 'mock-push-channel',
          registrationId: 'mock-reg-id-001',
        };
      },
    },
  };
}

export function useCommercialVendorAdapters(): CommercialVendorAdapters {
  const { env, vendors } = useAppRuntime();

  return useMemo(() => {
    const base =
      env.appVariant === 'production'
        ? createProductionUnconfiguredVendorAdapters()
        : createMockCommercialVendorAdapters();
    return {
      socialAuth: vendors?.socialAuth ?? base.socialAuth,
      payment: vendors?.payment ?? base.payment,
      mapNavigation: vendors?.mapNavigation ?? base.mapNavigation,
      vendorPush: vendors?.vendorPush ?? base.vendorPush,
    };
  }, [env.appVariant, vendors]);
}

export {
  createSentryErrorReporter,
  type SentryClientLike,
  type SentryErrorReporterOptions,
} from './sentry-error-reporter';

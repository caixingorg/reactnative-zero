/**
 * @module modules/payment-alipay
 * 职责：本地 Expo Module 的 TypeScript 入口，封装支付宝官方 Android/iOS 原生支付 SDK。
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export interface AlipayNativePayResult {
  resultStatus: string;
  result: string;
  memo: string;
}

export interface AlipayNativePayOptions {
  /** Android 沙箱环境开关（对应 EnvUtils.setEnv(SANDBOX)） */
  sandbox?: boolean;
  /** iOS 支付完成跳回 App 的 URL Scheme（须与 app.config.ts scheme 一致） */
  iosScheme?: string;
}

interface PaymentAlipayNativeModule {
  pay(orderInfo: string, secondArg: boolean | string): Promise<AlipayNativePayResult>;
}

const nativeModule = requireOptionalNativeModule<PaymentAlipayNativeModule>('PaymentAlipay');

export function isAlipayNativeModuleAvailable(): boolean {
  return nativeModule !== null;
}

export async function payWithAlipay(
  orderInfo: string,
  options?: AlipayNativePayOptions,
): Promise<AlipayNativePayResult> {
  if (!nativeModule) {
    throw new Error('ALIPAY_NATIVE_MODULE_NOT_LINKED');
  }
  if (Platform.OS === 'ios') {
    return nativeModule.pay(orderInfo, options?.iosScheme ?? '');
  }
  return nativeModule.pay(orderInfo, Boolean(options?.sandbox));
}

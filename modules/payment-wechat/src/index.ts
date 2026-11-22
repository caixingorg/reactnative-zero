/**
 * @module modules/payment-wechat
 * 职责：本地 Expo Module 的 TypeScript 入口，封装微信开放平台 Android/iOS 原生支付 SDK。
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface WechatNativePayParams {
  appId: string;
  partnerId: string;
  prepayId: string;
  packageValue?: string;
  nonceStr: string;
  timeStamp: string;
  sign: string;
}

export interface WechatNativePayResult {
  errCode: number;
  errStr: string;
}

interface PaymentWechatNativeModule {
  registerApp(appId: string, universalLink: string): Promise<boolean>;
  isWXAppInstalled(): Promise<boolean>;
  pay(params: Record<string, string>): Promise<WechatNativePayResult>;
}

const nativeModule = requireOptionalNativeModule<PaymentWechatNativeModule>('PaymentWechat');

export function isWechatNativeModuleAvailable(): boolean {
  return nativeModule !== null;
}

export async function registerWechatApp(appId: string, universalLink = ''): Promise<boolean> {
  if (!nativeModule) {
    return false;
  }
  return nativeModule.registerApp(appId, universalLink);
}

export async function isWechatAppInstalled(): Promise<boolean> {
  if (!nativeModule) {
    return false;
  }
  return nativeModule.isWXAppInstalled();
}

export async function payWithWechat(params: WechatNativePayParams): Promise<WechatNativePayResult> {
  if (!nativeModule) {
    throw new Error('WECHAT_NATIVE_MODULE_NOT_LINKED');
  }
  return nativeModule.pay({
    appId: params.appId,
    partnerId: params.partnerId,
    prepayId: params.prepayId,
    packageValue: params.packageValue ?? 'Sign=WXPay',
    nonceStr: params.nonceStr,
    timeStamp: params.timeStamp,
    sign: params.sign,
  });
}

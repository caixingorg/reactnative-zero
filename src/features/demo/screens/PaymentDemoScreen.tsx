/**
 * @module features/demo/screens/PaymentDemoScreen
 * 职责：演示全场景可插拔支付能力——接入真实本地支付宝原生 SDK（唤起客户端/自动降级 H5）、真实系统浏览器 H5 收银台（含切回前台自动查单）、0 元单、未安装置灰与 IAP 订阅/恢复购买。
 * 边界：仅依赖 core/capabilities/payment 公开门面与 core/ui，执行 --clean-starter 时自动移除。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { isAlipayNativeModuleAvailable, payWithAlipay } from '@root/modules/payment-alipay/src';
import {
  isWechatAppInstalled,
  isWechatNativeModuleAvailable,
  payWithWechat,
  registerWechatApp,
} from '@root/modules/payment-wechat/src';
import {
  ALIPAY_DRIVER_ID,
  createAlipayCheckoutDriver,
  createMockBillingDriver,
  createMockCheckoutDriver,
  createPaymentService,
  createReactNativeAppStateWatcher,
  createWebCheckoutDriver,
  createWechatCheckoutDriver,
  createZeroAmountDriver,
  WEB_CHECKOUT_DRIVER_ID,
  WECHAT_DRIVER_ID,
  ZERO_AMOUNT_DRIVER_ID,
  type PaymentOutcome,
  type RemotePaymentChannel,
  type ResolvedPaymentChannel,
  type StoreProduct,
} from '@/core/capabilities/payment';
import { useAppRuntime, useAuthSession, useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppHeader, AppText, Button, HStack, Screen, Switch, TextField, VStack } from '@/core/ui';
import { PaymentCashierSheet } from '../components/PaymentCashierSheet';

export interface PaymentDemoScreenProps {
  onBack?: () => void;
}

const DEMO_H5_CHECKOUT_URL = 'https://opendocs.alipay.com/open/204/105297';

// 原因：无真实商户签名串时仅用于真机验证能够成功拉起支付宝官方 SDK/收银台界面（支付宝会按规范提示订单参数无效）
const SAMPLE_ALIPAY_ORDER_INFO =
  'app_id=2021000000000000&biz_content=%7B%22out_trade_no%22%3A%22DEMO001%22%2C%22total_amount%22%3A%220.01%22%2C%22subject%22%3A%22Demo%22%7D&charset=utf-8&method=alipay.trade.app.pay&sign_type=RSA2&timestamp=2026-01-01+00%3A00%3A00&version=1.0&sign=DEMO_SIGN';

const DEMO_REMOTE_CHANNELS: readonly RemotePaymentChannel[] = [
  {
    channelCode: 'alipay',
    driverId: ALIPAY_DRIVER_ID,
    displayName: '支付宝（真实原生 SDK）',
    subtitle: '已装支付宝直接唤起客户端，未装自动降级内置 H5 收银台',
    iconKey: 'alipay',
    gatewayTag: '原生SDK',
  },
  {
    channelCode: 'paypal_web',
    driverId: WEB_CHECKOUT_DRIVER_ID,
    displayName: 'PayPal / 二级 H5 收银台（真实外跳）',
    subtitle: '直接打开手机浏览器，切回 App 后 1.5s 自动查单兜底',
    iconKey: 'web',
    gatewayTag: '真实H5',
  },
  {
    channelCode: 'coupon_free',
    driverId: ZERO_AMOUNT_DRIVER_ID,
    displayName: '优惠券全额抵扣（0 元单）',
    subtitle: '跳过外部支付直接走后端查单确认',
    iconKey: 'coupon',
  },
  {
    channelCode: 'wechat_unavailable',
    driverId: 'wechat_sdk',
    displayName: '微信支付（模拟未安装）',
    unavailablePolicy: 'disable',
    iconKey: 'wechat',
  },
];

export function PaymentDemoScreen({ onBack }: PaymentDemoScreenProps): React.JSX.Element {
  const { identity, keyValueStorage, capabilityOverrides } = useAppRuntime();
  const user = useAuthSession((state) => state.user);
  const toast = useToast();
  const { tokens } = useAppTheme();
  const currentUserId = user?.id ?? 'demo-user';
  const alipayNativeLinked = isAlipayNativeModuleAvailable();
  const wechatNativeLinked = isWechatNativeModuleAvailable();

  const [sandboxMode, setSandboxMode] = useState(false);
  const [customOrderInfo, setCustomOrderInfo] = useState('');

  const paymentService = useMemo(() => {
    if (capabilityOverrides?.paymentService) {
      return capabilityOverrides.paymentService;
    }

    const alipayDriver = alipayNativeLinked
      ? createAlipayCheckoutDriver({
          isLinked: isAlipayNativeModuleAvailable,
          nativePay: (payload) =>
            payWithAlipay(payload.orderInfo, {
              sandbox: payload.sandbox,
              iosScheme: payload.iosScheme,
            }),
        })
      : createMockCheckoutDriver({
          driverId: ALIPAY_DRIVER_ID,
          available: true,
          nextResult: { status: 'completed' },
        });

    const webDriver = createWebCheckoutDriver();

    const wechatDriver = wechatNativeLinked
      ? createWechatCheckoutDriver({
          registerApp: registerWechatApp,
          isInstalled: isWechatAppInstalled,
          nativePay: payWithWechat,
        })
      : createMockCheckoutDriver({
          driverId: WECHAT_DRIVER_ID,
          available: false,
        });

    const billingMock = createMockBillingDriver({
      driverId: 'mock_iap',
      products: [
        {
          productId: 'pro_monthly',
          type: 'subscription',
          title: 'Pro 月度会员（自动续费）',
          description: '支持商店实时本地价 + 安全核销闸门 + 换机恢复购买',
          localizedPrice: '¥30.00 / 月',
          currencyCode: 'CNY',
          subscriptionPeriod: 'P1M',
        },
      ],
    });

    return createPaymentService({
      keyValueStorage,
      appStateWatcher: createReactNativeAppStateWatcher(),
      checkoutDrivers: [alipayDriver, webDriver, wechatDriver, createZeroAmountDriver()],
      billingDriver: billingMock,
      verifier: {
        verifyCheckoutOrder: async () => ({ status: 'paid', message: '后端查单已确认付款' }),
        verifyStoreTransaction: async (tx) => ({
          verified: true,
          shouldFinishTransaction: true,
          orderId: `IAP-${tx.transactionId}`,
          message: '收据验真通过并已发放会员权益',
        }),
      },
    });
  }, [
    alipayNativeLinked,
    capabilityOverrides?.paymentService,
    keyValueStorage,
    wechatNativeLinked,
  ]);

  const [channels, setChannels] = useState<ResolvedPaymentChannel[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<PaymentOutcome | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = paymentService.onSessionRecovered((outcome) => {
      if (!active) {
        return;
      }
      setLastOutcome(outcome);
      toast.show({
        message: `冷启恢复订单 ${outcome.orderId}：${outcome.status}`,
        tone: outcome.status === 'succeeded' ? 'success' : 'info',
      });
    });

    void (async () => {
      await paymentService.initializeDrivers();
      const [resolvedChannels, storeProducts] = await Promise.all([
        paymentService.resolveChannels(DEMO_REMOTE_CHANNELS),
        paymentService.billing.fetchProducts(['pro_monthly'], 'subscription'),
      ]);
      if (!active) {
        return;
      }
      setChannels(resolvedChannels);
      setProducts(storeProducts);
    })();

    return () => {
      active = false;
      unsubscribe();
      if (!capabilityOverrides?.paymentService) {
        paymentService.dispose();
      }
    };
  }, [capabilityOverrides?.paymentService, paymentService, toast]);

  const handleCheckoutConfirm = async (channel: ResolvedPaymentChannel): Promise<void> => {
    setSubmitting(true);
    setSheetVisible(false);
    try {
      const orderId = `ORD-${Date.now().toString().slice(-6)}`;
      let payload: unknown = { demoChannel: channel.channelCode };

      if (channel.driverId === ALIPAY_DRIVER_ID) {
        payload = {
          orderInfo: customOrderInfo.trim() || SAMPLE_ALIPAY_ORDER_INFO,
          sandbox: sandboxMode,
          iosScheme: identity.scheme,
        };
      } else if (channel.driverId === WEB_CHECKOUT_DRIVER_ID) {
        payload = {
          checkoutUrl: DEMO_H5_CHECKOUT_URL,
          returnUrlPrefix: `${identity.scheme}://payment/return`,
        };
      }

      const outcome = await paymentService.checkout.pay(
        {
          orderId,
          channelCode: channel.channelCode,
          driverId: channel.driverId,
          payload,
        },
        { userId: currentUserId },
      );
      setLastOutcome(outcome);
      toast.show({
        message:
          outcome.status === 'succeeded'
            ? `支付成功（后端已核实）：${outcome.orderId}`
            : `支付结果：${outcome.status}${outcome.rawCode ? ` (${outcome.rawCode})` : ''}`,
        tone: outcome.status === 'succeeded' ? 'success' : 'info',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePurchaseSubscription = async (productId: string): Promise<void> => {
    setSubmitting(true);
    try {
      const outcome = await paymentService.billing.purchase(productId, {
        appAccountToken: currentUserId,
        isConsumable: false,
      });
      setLastOutcome(outcome);
      toast.show({
        message:
          outcome.status === 'succeeded'
            ? `订阅成功并安全核销：${outcome.orderId}`
            : `订阅失败：${outcome.errorCode ?? outcome.status}`,
        tone: outcome.status === 'succeeded' ? 'success' : 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestorePurchases = async (): Promise<void> => {
    setSubmitting(true);
    try {
      const results = await paymentService.billing.restorePurchases();
      if (results.length === 0) {
        toast.show({ message: '当前账号暂无可恢复的历史订阅', tone: 'info' });
      } else {
        setLastOutcome(results[0] ?? null);
        toast.show({ message: `已恢复 ${results.length} 笔有效订阅权益`, tone: 'success' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scrollable backgroundColor={tokens.colors.background}>
      <AppHeader title="全场景支付演示" showBack onBack={onBack} />
      <VStack p="lg" gap="lg">
        {/* One-time checkout card */}
        <VStack
          p="lg"
          gap="md"
          style={[
            styles.card,
            {
              backgroundColor: tokens.colors.surface,
              borderColor: tokens.colors.border,
              borderRadius: tokens.radii.lg,
            },
          ]}
        >
          <AppText variant="titleMd" weight="700">
            一次性支付（支付宝原生 SDK / 真实 H5 / 0 元单）
          </AppText>
          <AppText variant="caption" tone="secondary">
            支付宝原生桥状态：
            {alipayNativeLinked
              ? '已链接（可真实唤起支付宝或内置 H5）'
              : '未链接（需重新构建原生包，当前回退 Mock）'}
          </AppText>
          <Switch
            label="支付宝沙箱模式（Android EnvEnum.SANDBOX）"
            description="调试支付宝开放平台沙箱订单串时开启"
            value={sandboxMode}
            onValueChange={setSandboxMode}
          />
          <TextField
            label="自定义支付宝 orderInfo（可选）"
            placeholder="留空则使用示例串测试唤起支付宝 SDK"
            value={customOrderInfo}
            onChangeText={setCustomOrderInfo}
          />
          <VStack
            p="md"
            gap="sm"
            style={{
              backgroundColor: tokens.colors.surfaceMuted,
              borderRadius: tokens.radii.md,
            }}
          >
            <HStack align="center" justify="space-between" gap="sm">
              <AppText variant="bodyMd" weight="600" style={styles.flex1}>
                企业版物理硬件套装
              </AppText>
              <AppText variant="bodyMd" weight="700">
                ¥199.00
              </AppText>
            </HStack>
            <Button
              testID="open-cashier-button"
              label="打开收银台"
              onPress={() => setSheetVisible(true)}
            />
          </VStack>
        </VStack>

        {/* IAP Subscription card */}
        <VStack
          p="lg"
          gap="md"
          style={[
            styles.card,
            {
              backgroundColor: tokens.colors.surface,
              borderColor: tokens.colors.border,
              borderRadius: tokens.radii.lg,
            },
          ]}
        >
          <AppText variant="titleMd" weight="700">
            商店内购与订阅（Apple IAP / Google Billing）
          </AppText>
          {products.map((product) => (
            <VStack
              key={product.productId}
              p="md"
              gap="sm"
              style={{
                backgroundColor: tokens.colors.surfaceMuted,
                borderRadius: tokens.radii.md,
              }}
            >
              <HStack align="center" justify="space-between" gap="sm">
                <AppText variant="bodyMd" weight="600" style={styles.flex1}>
                  {product.title}
                </AppText>
                <AppText variant="bodyMd" weight="700">
                  {product.localizedPrice}
                </AppText>
              </HStack>
              <AppText variant="caption" tone="secondary">
                {product.description}
              </AppText>
              <HStack gap="sm">
                <View style={styles.flex1}>
                  <Button
                    testID={`iap-purchase-${product.productId}`}
                    label="立即订阅"
                    loading={submitting}
                    onPress={() => {
                      void handlePurchaseSubscription(product.productId);
                    }}
                  />
                </View>
                <View style={styles.flex1}>
                  <Button
                    testID="iap-restore-button"
                    label="恢复购买"
                    variant="secondary"
                    disabled={submitting}
                    onPress={() => {
                      void handleRestorePurchases();
                    }}
                  />
                </View>
              </HStack>
            </VStack>
          ))}
        </VStack>

        {/* Last outcome readout */}
        {lastOutcome ? (
          <VStack
            testID="payment-outcome-card"
            p="md"
            gap="xs"
            style={[
              styles.card,
              {
                backgroundColor: tokens.colors.surface,
                borderColor: tokens.colors.border,
                borderRadius: tokens.radii.md,
              },
            ]}
          >
            <AppText variant="caption" tone="secondary">
              最近一次支付核实结果
            </AppText>
            <AppText variant="bodySm" weight="600">
              订单：{lastOutcome.orderId} · 渠道：{lastOutcome.channelCode}
            </AppText>
            <AppText variant="caption" tone="secondary">
              状态：{lastOutcome.status}
              {lastOutcome.rawCode ? ` (code: ${lastOutcome.rawCode})` : ''} · 后端已核实：
              {lastOutcome.verifiedByServer ? '是' : '否'}
            </AppText>
            {lastOutcome.message ? (
              <AppText variant="caption" tone="secondary">
                详情：{lastOutcome.message}
              </AppText>
            ) : null}
          </VStack>
        ) : null}
      </VStack>

      <PaymentCashierSheet
        visible={sheetVisible}
        amountLabel="¥199.00"
        orderTitle="企业版物理硬件套装"
        channels={channels}
        submitting={submitting}
        onClose={() => setSheetVisible(false)}
        onConfirm={(channel) => {
          void handleCheckoutConfirm(channel);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex1: {
    flex: 1,
  },
});

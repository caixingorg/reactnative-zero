/**
 * @module features/demo/screens/PaymentDemoScreen
 * 职责：演示全场景可插拔支付能力（一次性支付、二级聚合通道切换、0 元单、未安装置灰、杀进程恢复与 IAP 订阅/恢复购买）。
 * 边界：仅依赖 core/capabilities/payment 公开门面与 core/ui，执行 --clean-starter 时自动移除。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  createMockBillingDriver,
  createMockCheckoutDriver,
  createPaymentService,
  createReactNativeAppStateWatcher,
  createZeroAmountDriver,
  type PaymentOutcome,
  type RemotePaymentChannel,
  type ResolvedPaymentChannel,
  type StoreProduct,
} from '@/core/capabilities/payment';
import { useAppRuntime, useAuthSession, useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppHeader, AppText, Button, HStack, Screen, VStack } from '@/core/ui';
import { PaymentCashierSheet } from '../components/PaymentCashierSheet';

export interface PaymentDemoScreenProps {
  onBack?: () => void;
}

const DEMO_REMOTE_CHANNELS: readonly RemotePaymentChannel[] = [
  {
    channelCode: 'alipay',
    driverId: 'alipay_sdk',
    displayName: '支付宝',
    subtitle: '模拟一级直连或二级聚合原厂出参',
    iconKey: 'alipay',
    gatewayTag: '二级聚合',
  },
  {
    channelCode: 'paypal_web',
    driverId: 'web_checkout_mock',
    displayName: 'PayPal / 二级 H5 收银台',
    subtitle: '通用浏览器跳转 + Deep Link 回跳（0 原生依赖）',
    iconKey: 'web',
    gatewayTag: 'H5',
  },
  {
    channelCode: 'coupon_free',
    driverId: 'zero_amount',
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
  const { keyValueStorage, capabilityOverrides } = useAppRuntime();
  const user = useAuthSession((state) => state.user);
  const toast = useToast();
  const { tokens } = useAppTheme();
  const currentUserId = user?.id ?? 'demo-user';

  const paymentService = useMemo(() => {
    if (capabilityOverrides?.paymentService) {
      return capabilityOverrides.paymentService;
    }

    const alipayMock = createMockCheckoutDriver({
      driverId: 'alipay_sdk',
      available: true,
      nextResult: { status: 'completed' },
    });
    const webMock = createMockCheckoutDriver({
      driverId: 'web_checkout_mock',
      available: true,
      nextResult: { status: 'completed' },
    });
    const wechatMissing = createMockCheckoutDriver({
      driverId: 'wechat_sdk',
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
      checkoutDrivers: [alipayMock, webMock, wechatMissing, createZeroAmountDriver()],
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
  }, [capabilityOverrides?.paymentService, keyValueStorage]);

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
    try {
      const orderId = `ORD-${Date.now().toString().slice(-6)}`;
      const outcome = await paymentService.checkout.pay(
        {
          orderId,
          channelCode: channel.channelCode,
          driverId: channel.driverId,
          payload: { demoChannel: channel.channelCode },
        },
        { userId: currentUserId },
      );
      setLastOutcome(outcome);
      setSheetVisible(false);
      toast.show({
        message:
          outcome.status === 'succeeded'
            ? `支付成功（后端已核实）：${outcome.orderId}`
            : `支付状态：${outcome.status}`,
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
      <AppHeader title="全场景支付演示" onBack={onBack} />
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
            一次性支付（一级直连 / 二级聚合 / H5 / 0 元单）
          </AppText>
          <AppText variant="bodySm" tone="secondary">
            后端下发可用渠道与本地已注册驱动取交集；支付结果强制经后端查单核实，支持切回前台与冷启恢复。
          </AppText>
          <HStack align="center" justify="space-between">
            <VStack>
              <AppText variant="caption" tone="secondary">
                演示商品
              </AppText>
              <AppText variant="bodyMd" weight="600">
                企业版物理硬件套装 · ¥199.00
              </AppText>
            </VStack>
            <Button
              testID="open-cashier-button"
              label="打开收银台"
              onPress={() => setSheetVisible(true)}
            />
          </HStack>
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
              <HStack align="center" justify="space-between">
                <AppText variant="bodyMd" weight="600">
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
              状态：{lastOutcome.status} · 后端已核实：{lastOutcome.verifiedByServer ? '是' : '否'}
            </AppText>
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

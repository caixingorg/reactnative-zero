/**
 * @module features/payment/screens/CheckoutScreen
 * 职责：演示全场景可插拔支付能力——接入真实本地支付宝原生 SDK（唤起客户端/自动降级 H5）、真实系统浏览器 H5 收银台（含切回前台自动查单）、0 元单、未安装置灰与 IAP 订阅/恢复购买。
 * 边界：仅依赖 core/capabilities/payment 公开门面与 core/ui，执行 --clean-starter 时自动移除。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

export interface CheckoutScreenProps {
  onBack?: () => void;
}

const SANDBOX_H5_CHECKOUT_URL = 'https://opendocs.alipay.com/open/204/105297';

// 原因：无真实商户签名串时仅用于真机验证能够成功拉起支付宝官方 SDK/收银台界面（支付宝会按规范提示订单参数无效）
const SAMPLE_ALIPAY_ORDER_INFO =
  'app_id=2021000000000000&biz_content=%7B%22out_trade_no%22%3A%22SANDBOX001%22%2C%22total_amount%22%3A%220.01%22%2C%22subject%22%3A%22Order%22%7D&charset=utf-8&method=alipay.trade.app.pay&sign_type=RSA2&timestamp=2026-01-01+00%3A00%3A00&version=1.0&sign=SANDBOX_SIGN';

const DEFAULT_REMOTE_CHANNELS: readonly RemotePaymentChannel[] = [
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
    displayName: 'PayPal / 二级 H5 收银台',
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
    channelCode: 'wechat',
    driverId: WECHAT_DRIVER_ID,
    displayName: '微信支付（原生 SDK）',
    subtitle: '需重新构建原生包并安装微信客户端后可用',
    unavailablePolicy: 'disable',
    iconKey: 'wechat',
    gatewayTag: '原生SDK',
  },
];

export function CheckoutScreen({ onBack }: CheckoutScreenProps): React.JSX.Element {
  const { identity, env, keyValueStorage, capabilityOverrides } = useAppRuntime();
  const user = useAuthSession((state) => state.user);
  const toast = useToast();
  const { tokens } = useAppTheme();
  const currentUserId = user?.id ?? 'guest-user';
  const alipayNativeLinked = isAlipayNativeModuleAvailable();
  const wechatNativeLinked = isWechatNativeModuleAvailable();

  const [sandboxMode, setSandboxMode] = useState(false);
  const [customOrderInfo, setCustomOrderInfo] = useState('');
  const [debugExpanded, setDebugExpanded] = useState(false);

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
      const [resolvedChannels, subProducts, lifetimeProducts] = await Promise.all([
        paymentService.resolveChannels(DEFAULT_REMOTE_CHANNELS),
        paymentService.billing.fetchProducts(['pro_monthly'], 'subscription'),
        paymentService.billing.fetchProducts(['pro_lifetime'], 'non_consumable'),
      ]);
      if (!active) {
        return;
      }
      setChannels(resolvedChannels);
      setProducts([...subProducts, ...lifetimeProducts]);
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
      let payload: unknown = { channelCode: channel.channelCode };

      if (channel.driverId === ALIPAY_DRIVER_ID) {
        payload = {
          orderInfo: customOrderInfo.trim() || SAMPLE_ALIPAY_ORDER_INFO,
          sandbox: sandboxMode,
          iosScheme: identity.scheme,
        };
      } else if (channel.driverId === WEB_CHECKOUT_DRIVER_ID) {
        payload = {
          checkoutUrl: SANDBOX_H5_CHECKOUT_URL,
          returnUrlPrefix: `${identity.scheme}://payment/return`,
        };
      } else if (channel.driverId === WECHAT_DRIVER_ID) {
        payload = {
          appId: 'wx0000000000000000',
          partnerId: '1900000109',
          prepayId: 'wx2026sandboxprepayid',
          packageValue: 'Sign=WXPay',
          nonceStr: 'sandbox_nonce_123',
          timeStamp: String(Math.floor(Date.now() / 1000)),
          sign: 'SANDBOX_WECHAT_SIGN',
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
    <Screen
      edges={['top', 'bottom', 'left', 'right']}
      statusBarBackgroundColor={tokens.colors.surface}
    >
      <AppHeader title="收银台与会员" showBack onBack={onBack} />
      <Screen scrollable edges={[]}>
        <VStack gap="lg">
          {/* 顶部无框权益 Hero：直接在画布上呼吸排版，消除卡片套卡片的拥挤感 */}
          <VStack gap="md">
            <HStack align="center" justify="space-between">
              <HStack
                align="center"
                gap="xs"
                style={[
                  styles.proBadge,
                  { backgroundColor: tokens.colors.primarySoft, borderRadius: tokens.radii.full },
                ]}
              >
                <Ionicons name="sparkles" size={13} color={tokens.colors.primary} />
                <AppText variant="caption" tone="brand" weight="700">
                  PRO 专业版
                </AppText>
              </HStack>
              <AppText variant="caption" tone="secondary">
                App Store / Google Play
              </AppText>
            </HStack>

            <VStack gap="xs">
              <AppText variant="titleLg" weight="700">
                解锁全部专业工具能力
              </AppText>
              <AppText variant="bodySm" tone="secondary">
                选择适合你的方案，支持换机恢复已购权益
              </AppText>
            </VStack>

            <VStack
              p="md"
              gap="xs"
              style={[
                styles.card,
                {
                  backgroundColor: tokens.colors.surface,
                  borderColor: tokens.colors.border,
                  borderRadius: tokens.radii.lg,
                },
              ]}
            >
              {[
                '全端云同步与不限次高清导出',
                '无广告纯净工作区与极速引擎',
                '持续功能更新与优先技术支持',
              ].map((perk) => (
                <HStack key={perk} align="center" gap="sm">
                  <Ionicons name="checkmark-circle" size={16} color={tokens.colors.success} />
                  <AppText variant="bodySm">{perk}</AppText>
                </HStack>
              ))}
            </VStack>
          </VStack>

          {/* 订阅与买断方案列表（各自独立白卡，无套娃、永不重叠） */}
          <VStack gap="sm">
            {products.map((product) => {
              const isLifetime = product.type === 'non_consumable';
              return (
                <VStack
                  key={product.productId}
                  p="lg"
                  gap="md"
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: tokens.colors.surface,
                      borderColor: isLifetime ? tokens.colors.primary : tokens.colors.border,
                      borderRadius: tokens.radii.lg,
                    },
                  ]}
                >
                  <HStack align="flex-start" justify="space-between" gap="md">
                    <VStack flex={1} gap="xs">
                      {isLifetime ? (
                        <View
                          style={[
                            styles.recommendPill,
                            {
                              backgroundColor: tokens.colors.primarySoft,
                              borderRadius: tokens.radii.full,
                            },
                          ]}
                        >
                          <AppText variant="caption" tone="brand" weight="700">
                            超值推荐 · 永久有效
                          </AppText>
                        </View>
                      ) : null}
                      <AppText variant="titleMd" weight="700">
                        {product.title}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        {product.description}
                      </AppText>
                    </VStack>
                    <VStack align="flex-end" style={styles.priceCol}>
                      <AppText
                        variant="titleMd"
                        tone={isLifetime ? 'brand' : 'primary'}
                        weight="700"
                      >
                        {product.localizedPrice}
                      </AppText>
                      {isLifetime ? (
                        <AppText variant="caption" tone="secondary">
                          一次买断
                        </AppText>
                      ) : null}
                    </VStack>
                  </HStack>

                  <Button
                    testID={`iap-purchase-${product.productId}`}
                    label={product.type === 'subscription' ? '立即订阅' : '永久买断'}
                    variant={isLifetime ? 'primary' : 'outline'}
                    loading={submitting}
                    onPress={() => {
                      void handlePurchaseSubscription(product.productId);
                    }}
                  />
                </VStack>
              );
            })}

            {products.length > 0 ? (
              <Pressable
                testID="iap-restore-button"
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => {
                  void handleRestorePurchases();
                }}
                style={({ pressed }) => [styles.restoreLink, pressed && styles.pressed]}
              >
                <AppText variant="caption" tone="secondary" weight="600" align="center">
                  已购买过会员？点击恢复购买
                </AppText>
              </Pressable>
            ) : null}
          </VStack>

          {/* 标准订单收银台 */}
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
            <HStack align="center" justify="space-between">
              <AppText variant="titleMd" weight="700">
                订单结算
              </AppText>
              <HStack align="center" gap="xs">
                <Ionicons name="shield-checkmark-outline" size={14} color={tokens.colors.success} />
                <AppText variant="caption" tone="secondary">
                  官方安全收银台
                </AppText>
              </HStack>
            </HStack>

            <HStack
              p="md"
              gap="md"
              align="center"
              style={{
                backgroundColor: tokens.colors.surfaceMuted,
                borderRadius: tokens.radii.md,
              }}
            >
              <View
                style={[
                  styles.orderIconBox,
                  { backgroundColor: tokens.colors.primarySoft, borderRadius: tokens.radii.md },
                ]}
              >
                <Ionicons name="cube-outline" size={22} color={tokens.colors.primary} />
              </View>
              <VStack flex={1} gap="xs">
                <AppText variant="bodyMd" weight="600">
                  企业版物理硬件套装
                </AppText>
                <AppText variant="caption" tone="secondary">
                  支持支付宝、微信支付与国际收银台
                </AppText>
              </VStack>
              <AppText variant="titleMd" tone="brand" weight="700">
                ¥199.00
              </AppText>
            </HStack>

            <Button
              testID="open-cashier-button"
              label="立即支付 ¥199.00"
              onPress={() => setSheetVisible(true)}
            />

            {env.appVariant !== 'production' ? (
              <VStack gap="sm" style={styles.debugWrap}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDebugExpanded((prev) => !prev)}
                  style={styles.debugToggle}
                >
                  <HStack align="center" justify="space-between">
                    <AppText variant="caption" tone="secondary" weight="600">
                      联调与沙箱参数（仅非生产环境可见）
                    </AppText>
                    <Ionicons
                      name={debugExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={tokens.colors.textSecondary}
                    />
                  </HStack>
                </Pressable>
                {debugExpanded ? (
                  <VStack gap="sm" style={{ paddingTop: tokens.spacing.xs }}>
                    <AppText variant="caption" tone="secondary">
                      支付宝原生桥：{alipayNativeLinked ? '已链接' : '未链接'} · 微信原生桥：
                      {wechatNativeLinked ? '已链接' : '未链接'}
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
                  </VStack>
                ) : null}
              </VStack>
            ) : null}
          </VStack>

          {/* 最近一次核实结果 */}
          {lastOutcome ? (
            <VStack
              testID="payment-outcome-card"
              p="md"
              gap="xs"
              style={[
                styles.card,
                {
                  backgroundColor: tokens.colors.surface,
                  borderColor:
                    lastOutcome.status === 'succeeded'
                      ? tokens.colors.success
                      : tokens.colors.border,
                  borderRadius: tokens.radii.md,
                },
              ]}
            >
              <HStack align="center" justify="space-between">
                <AppText variant="caption" tone="secondary" weight="600">
                  最近一次支付核实结果
                </AppText>
                <AppText
                  variant="caption"
                  tone={lastOutcome.status === 'succeeded' ? 'brand' : 'secondary'}
                  weight="700"
                >
                  {lastOutcome.status.toUpperCase()}
                </AppText>
              </HStack>
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
      </Screen>

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
  proBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planCard: {
    borderWidth: 1.5,
  },
  recommendPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  priceCol: {
    flexShrink: 0,
  },
  restoreLink: {
    paddingVertical: 6,
  },
  orderIconBox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugWrap: {
    marginTop: 4,
  },
  debugToggle: {
    paddingVertical: 6,
  },
  pressed: {
    opacity: 0.72,
  },
  flex1: {
    flex: 1,
  },
});

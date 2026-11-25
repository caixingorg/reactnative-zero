/**
 * @module features/payment/screens/CheckoutScreen
 * 职责：演示全场景可插拔支付能力——接入真实本地支付宝原生 SDK（唤起客户端/自动降级 H5）、真实系统浏览器 H5 收银台（含切回前台自动查单）、0 元单、未安装置灰与 IAP 订阅/恢复购买。
 * 边界：仅依赖 core/capabilities/payment 公开门面与 core/ui，执行 --clean-starter 时自动移除。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  createPaymentService,
  createReactNativeAppStateWatcher,
  createWebCheckoutDriver,
  createWechatCheckoutDriver,
  createZeroAmountDriver,
  WEB_CHECKOUT_DRIVER_ID,
  WECHAT_DRIVER_ID,
  ZERO_AMOUNT_DRIVER_ID,
  type CheckoutDriver,
  type PaymentOutcome,
  type PaymentService,
  type RemotePaymentChannel,
  type ResolvedPaymentChannel,
  type StoreProduct,
} from '@/core/capabilities/payment';
import { useAppRuntime, useAuthSession, usePrivacyGate, useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppHeader,
  AppText,
  Button,
  HStack,
  PageTemplate,
  Screen,
  Switch,
  TextField,
  VStack,
} from '@/core/ui';
import {
  createCheckoutSandboxVerifier,
  createSandboxFallbackDrivers,
  getSandboxCheckoutFixtures,
} from '../checkout-sandbox';
import { PaymentCashierSheet } from '../components/PaymentCashierSheet';
import { appTranslationResources } from '@/shared';

export interface CheckoutScreenProps {
  onBack?: () => void;
}

// 原因：优先读取 Expo 运行时配置中的变体 scheme（保留 -dev / -stg 后缀），缺失或空白时回退到 App Identity
function resolveActiveReturnScheme(fallbackScheme: string): string {
  const configuredScheme: string | string[] | undefined = Constants.expoConfig?.scheme;
  if (typeof configuredScheme === 'string') {
    const trimmed = configuredScheme.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  } else if (Array.isArray(configuredScheme)) {
    const firstValid = configuredScheme.find(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    if (firstValid) {
      return firstValid.trim();
    }
  }
  return fallbackScheme;
}

function formatErrorReason(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return fallback;
}

export function CheckoutScreen({ onBack }: CheckoutScreenProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  if (!i18n.exists('checkout.title')) {
    i18n.addResourceBundle('zh-CN', 'translation', appTranslationResources['zh-CN'], true, false);
    i18n.addResourceBundle('en-US', 'translation', appTranslationResources['en-US'], true, false);
  }
  const { identity, env, keyValueStorage, capabilityOverrides } = useAppRuntime();
  const isPrivacyReady = usePrivacyGate((state) => state.phase === 'ready');
  const user = useAuthSession((state) => state.user);
  const toast = useToast();
  const { tokens } = useAppTheme();
  const currentUserId = user?.id ?? 'guest-user';
  const alipayNativeLinked = isAlipayNativeModuleAvailable();
  const wechatNativeLinked = isWechatNativeModuleAvailable();
  const overridePaymentService = capabilityOverrides?.paymentService;

  const toastRef = useRef(toast);
  const tRef = useRef(t);
  useEffect(() => {
    toastRef.current = toast;
    tRef.current = t;
  }, [toast, t]);

  const [sandboxMode, setSandboxMode] = useState(false);
  const [customOrderInfo, setCustomOrderInfo] = useState('');
  const [debugExpanded, setDebugExpanded] = useState(false);

  const remoteChannels = useMemo<readonly RemotePaymentChannel[]>(
    () => [
      {
        channelCode: 'alipay',
        driverId: ALIPAY_DRIVER_ID,
        displayName: t('checkout.channelAlipayName'),
        subtitle: t('checkout.channelAlipaySubtitle'),
        iconKey: 'alipay',
        gatewayTag: t('checkout.tagNativeSdk'),
      },
      {
        channelCode: 'paypal_web',
        driverId: WEB_CHECKOUT_DRIVER_ID,
        displayName: t('checkout.channelPaypalWebName'),
        subtitle: t('checkout.channelPaypalWebSubtitle'),
        iconKey: 'web',
        gatewayTag: t('checkout.tagLiveH5'),
      },
      {
        channelCode: 'coupon_free',
        driverId: ZERO_AMOUNT_DRIVER_ID,
        displayName: t('checkout.channelCouponName'),
        subtitle: t('checkout.channelCouponSubtitle'),
        iconKey: 'coupon',
      },
      {
        channelCode: 'wechat',
        driverId: WECHAT_DRIVER_ID,
        displayName: t('checkout.channelWechatName'),
        subtitle: t('checkout.channelWechatSubtitle'),
        unavailablePolicy: 'disable',
        iconKey: 'wechat',
        gatewayTag: t('checkout.tagNativeSdk'),
      },
    ],
    [t],
  );

  const paymentService = useMemo(() => {
    if (overridePaymentService) {
      return overridePaymentService;
    }

    const fallbackDrivers = createSandboxFallbackDrivers({
      alipayLinked: alipayNativeLinked,
      wechatLinked: wechatNativeLinked,
    });

    const alipayDriver = alipayNativeLinked
      ? createAlipayCheckoutDriver({
          isLinked: isAlipayNativeModuleAvailable,
          nativePay: (payload) =>
            payWithAlipay(payload.orderInfo, {
              sandbox: payload.sandbox,
              iosScheme: payload.iosScheme,
            }),
        })
      : fallbackDrivers.alipayDriver;

    const webDriver = createWebCheckoutDriver();

    const wechatDriver = wechatNativeLinked
      ? createWechatCheckoutDriver({
          registerApp: registerWechatApp,
          isInstalled: isWechatAppInstalled,
          nativePay: payWithWechat,
        })
      : fallbackDrivers.wechatDriver;

    const checkoutDrivers: CheckoutDriver[] = [
      ...(alipayDriver ? [alipayDriver] : []),
      webDriver,
      ...(wechatDriver ? [wechatDriver] : []),
      createZeroAmountDriver(),
    ];

    return createPaymentService({
      keyValueStorage,
      appStateWatcher: createReactNativeAppStateWatcher(),
      checkoutDrivers,
      billingDriver: fallbackDrivers.billingDriver,
      verifier: createCheckoutSandboxVerifier(),
    });
  }, [alipayNativeLinked, keyValueStorage, overridePaymentService, wechatNativeLinked]);

  const [initResult, setInitResult] = useState<{
    service: PaymentService;
    userId: string;
    remoteChannels: readonly RemotePaymentChannel[];
    retryNonce: number;
    channels: ResolvedPaymentChannel[];
    products: StoreProduct[];
    errorMessage: string | null;
  } | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<PaymentOutcome | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // 原因：仅在组件卸载或 paymentService/覆盖实例切换时释放服务，避免切换用户或隐私状态时误销毁仍在使用的实例
  useEffect(() => {
    return () => {
      if (!overridePaymentService) {
        paymentService.dispose();
      }
    };
  }, [overridePaymentService, paymentService]);

  useEffect(() => {
    let active = true;
    const unsubscribe = paymentService.onSessionRecovered((outcome) => {
      if (!active) {
        return;
      }
      setLastOutcome(outcome);
      toastRef.current.show({
        message: tRef.current('checkout.recoveredToast', {
          orderId: outcome.orderId,
          status: outcome.status,
        }),
        tone: outcome.status === 'succeeded' ? 'success' : 'info',
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [paymentService]);

  useEffect(() => {
    if (!isPrivacyReady) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        await paymentService.initializeDrivers();
        const [resolvedChannels, subProducts, lifetimeProducts] = await Promise.all([
          paymentService.resolveChannels(remoteChannels),
          paymentService.billing.fetchProducts(['pro_monthly'], 'subscription'),
          paymentService.billing.fetchProducts(['pro_lifetime'], 'non_consumable'),
        ]);
        await paymentService.checkout.recoverPendingSessions({ userId: currentUserId });
        if (!active) {
          return;
        }
        setInitResult({
          service: paymentService,
          userId: currentUserId,
          remoteChannels,
          retryNonce,
          channels: resolvedChannels,
          products: [...subProducts, ...lifetimeProducts],
          errorMessage: null,
        });
      } catch (error: unknown) {
        if (!active) {
          return;
        }
        setInitResult({
          service: paymentService,
          userId: currentUserId,
          remoteChannels,
          retryNonce,
          channels: [],
          products: [],
          errorMessage: formatErrorReason(error, tRef.current('checkout.loadErrorDescription')),
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUserId, isPrivacyReady, paymentService, remoteChannels, retryNonce]);

  const handleCheckoutConfirm = async (channel: ResolvedPaymentChannel): Promise<void> => {
    setSubmitting(true);
    setSheetVisible(false);
    try {
      const orderId = `ORD-${Date.now().toString().slice(-6)}`;
      const activeScheme = resolveActiveReturnScheme(identity.scheme);
      const fixtures = getSandboxCheckoutFixtures();
      let payload: unknown = { channelCode: channel.channelCode };

      if (channel.driverId === ALIPAY_DRIVER_ID) {
        const orderInfo = customOrderInfo.trim() || fixtures?.alipayOrderInfo || '';
        if (!orderInfo) {
          toastRef.current.show({
            message: tRef.current('checkout.sandboxPayloadUnavailable'),
            tone: 'danger',
          });
          return;
        }
        payload = {
          orderInfo,
          sandbox: sandboxMode,
          iosScheme: activeScheme,
        };
      } else if (channel.driverId === WEB_CHECKOUT_DRIVER_ID) {
        if (!fixtures?.webCheckoutUrl) {
          toastRef.current.show({
            message: tRef.current('checkout.sandboxPayloadUnavailable'),
            tone: 'danger',
          });
          return;
        }
        payload = {
          checkoutUrl: fixtures.webCheckoutUrl,
          returnUrlPrefix: `${activeScheme}://payment/return`,
        };
      } else if (channel.driverId === WECHAT_DRIVER_ID) {
        if (!fixtures?.wechatPayload) {
          toastRef.current.show({
            message: tRef.current('checkout.sandboxPayloadUnavailable'),
            tone: 'danger',
          });
          return;
        }
        payload = fixtures.wechatPayload;
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
      toastRef.current.show({
        message:
          outcome.status === 'succeeded'
            ? tRef.current('checkout.paySucceededToast', { orderId: outcome.orderId })
            : tRef.current('checkout.payResultToast', {
                status: outcome.status,
                rawCodeSuffix: outcome.rawCode ? ` (${outcome.rawCode})` : '',
              }),
        tone: outcome.status === 'succeeded' ? 'success' : 'info',
      });
    } catch (error: unknown) {
      toastRef.current.show({
        message: tRef.current('checkout.payFailedToast', {
          reason: formatErrorReason(error, tRef.current('checkout.unknownError')),
        }),
        tone: 'danger',
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
      toastRef.current.show({
        message:
          outcome.status === 'succeeded'
            ? tRef.current('checkout.subscribeSucceededToast', { orderId: outcome.orderId })
            : tRef.current('checkout.subscribeFailedToast', {
                reason: outcome.errorCode ?? outcome.status,
              }),
        tone: outcome.status === 'succeeded' ? 'success' : 'danger',
      });
    } catch (error: unknown) {
      toastRef.current.show({
        message: tRef.current('checkout.subscribeFailedToast', {
          reason: formatErrorReason(error, tRef.current('checkout.unknownError')),
        }),
        tone: 'danger',
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
        toastRef.current.show({
          message: tRef.current('checkout.restoreEmptyToast'),
          tone: 'info',
        });
      } else {
        setLastOutcome(results[0] ?? null);
        toastRef.current.show({
          message: tRef.current('checkout.restoreSucceededToast', { count: results.length }),
          tone: 'success',
        });
      }
    } catch (error: unknown) {
      toastRef.current.show({
        message: tRef.current('checkout.restoreFailedToast', {
          reason: formatErrorReason(error, tRef.current('checkout.unknownError')),
        }),
        tone: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isSettled =
    initResult !== null &&
    initResult.service === paymentService &&
    initResult.userId === currentUserId &&
    initResult.remoteChannels === remoteChannels &&
    initResult.retryNonce === retryNonce;
  const isLoading = isPrivacyReady && !isSettled;
  const initError = isPrivacyReady && isSettled ? initResult.errorMessage : null;
  const channels = isSettled && !initError ? initResult.channels : [];
  const products = isSettled && !initError ? initResult.products : [];
  const pageStatus = initError ? 'error' : isLoading ? 'loading' : 'ready';

  return (
    <Screen
      edges={['top', 'bottom', 'left', 'right']}
      statusBarBackgroundColor={tokens.colors.surface}
    >
      <PageTemplate
        status={pageStatus}
        header={<AppHeader title={t('checkout.title')} showBack onBack={onBack} />}
        errorTitle={t('checkout.loadErrorTitle')}
        errorDescription={initError ?? t('checkout.loadErrorDescription')}
        retryLabel={t('common.retry')}
        onRetry={() => setRetryNonce((prev) => prev + 1)}
      >
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
                    {t('checkout.proBadge')}
                  </AppText>
                </HStack>
                <AppText variant="caption" tone="secondary">
                  App Store / Google Play
                </AppText>
              </HStack>

              <VStack gap="xs">
                <AppText variant="titleLg" weight="700">
                  {t('checkout.heroTitle')}
                </AppText>
                <AppText variant="bodySm" tone="secondary">
                  {t('checkout.heroSubtitle')}
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
                  t('checkout.perkCloudSync'),
                  t('checkout.perkAdFree'),
                  t('checkout.perkPrioritySupport'),
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
                              {t('checkout.lifetimeBadge')}
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
                            {t('checkout.lifetimeTag')}
                          </AppText>
                        ) : null}
                      </VStack>
                    </HStack>

                    <Button
                      testID={`iap-purchase-${product.productId}`}
                      label={
                        product.type === 'subscription'
                          ? t('checkout.subscribeButton')
                          : t('checkout.buyLifetimeButton')
                      }
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
                    {t('checkout.restoreButton')}
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
                  {t('checkout.orderSectionTitle')}
                </AppText>
                <HStack align="center" gap="xs">
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={14}
                    color={tokens.colors.success}
                  />
                  <AppText variant="caption" tone="secondary">
                    {t('checkout.securityBadge')}
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
                    {t('checkout.sampleOrderTitle')}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {t('checkout.sampleOrderSubtitle')}
                  </AppText>
                </VStack>
                <AppText variant="titleMd" tone="brand" weight="700">
                  ¥199.00
                </AppText>
              </HStack>

              <Button
                testID="open-cashier-button"
                label={t('checkout.payNowButton', { amount: '¥199.00' })}
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
                        {t('checkout.debugToggleTitle')}
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
                        {t('checkout.nativeBridgeStatus', {
                          alipayStatus: alipayNativeLinked
                            ? t('checkout.linked')
                            : t('checkout.unlinked'),
                          wechatStatus: wechatNativeLinked
                            ? t('checkout.linked')
                            : t('checkout.unlinked'),
                        })}
                      </AppText>
                      <Switch
                        label={t('checkout.alipaySandboxLabel')}
                        description={t('checkout.alipaySandboxDescription')}
                        value={sandboxMode}
                        onValueChange={setSandboxMode}
                      />
                      <TextField
                        label={t('checkout.customOrderInfoLabel')}
                        placeholder={t('checkout.customOrderInfoPlaceholder')}
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
                    {t('checkout.lastOutcomeTitle')}
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
                  {t('checkout.outcomeOrderChannel', {
                    orderId: lastOutcome.orderId,
                    channel: lastOutcome.channelCode,
                  })}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {t('checkout.outcomeStatusVerified', {
                    status: lastOutcome.status,
                    rawCodeSuffix: lastOutcome.rawCode ? ` (code: ${lastOutcome.rawCode})` : '',
                    verified: lastOutcome.verifiedByServer ? t('checkout.yes') : t('checkout.no'),
                  })}
                </AppText>
                {lastOutcome.message ? (
                  <AppText variant="caption" tone="secondary">
                    {t('checkout.outcomeDetail', { message: lastOutcome.message })}
                  </AppText>
                ) : null}
              </VStack>
            ) : null}
          </VStack>
        </Screen>
      </PageTemplate>

      <PaymentCashierSheet
        visible={sheetVisible}
        amountLabel="¥199.00"
        orderTitle={t('checkout.sampleOrderTitle')}
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

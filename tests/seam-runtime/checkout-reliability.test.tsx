import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import * as paymentCore from '@/core/capabilities/payment';
import type { PaymentOutcome, PaymentService, StoreProduct } from '@/core/capabilities/payment';
import { createControllableNetworkMonitor } from '@/core/network/network-monitor';
import { AppRuntimeProvider, createAppRuntime, type AppRuntime } from '@/core/runtime';
import type { KeyValueStorageDriver, SecretStorageDriver } from '@/core/storage/types';
import {
  CheckoutScreen,
  createCheckoutSandboxVerifier,
  createSandboxFallbackDrivers,
  getSandboxCheckoutFixtures,
  PaymentCashierSheet,
} from '@/features/payment';
import { appTranslationResources } from '@/shared';
import { appIdentity } from '@root/app.identity';

let mockExpoConfig: { scheme?: string | string[] } | null = null;
let mockNullSandboxFixtures = false;

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));

jest.mock('../../src/features/payment/checkout-sandbox', () => {
  const actual = jest.requireActual<typeof import('../../src/features/payment/checkout-sandbox')>(
    '../../src/features/payment/checkout-sandbox',
  );
  return {
    ...actual,
    getSandboxCheckoutFixtures: jest.fn(() =>
      mockNullSandboxFixtures ? null : actual.getSandboxCheckoutFixtures(),
    ),
  };
});

const disposeSpies: jest.SpyInstance[] = [];

jest.mock('@/core/capabilities/payment', () => {
  const actual = jest.requireActual<typeof import('@/core/capabilities/payment')>(
    '@/core/capabilities/payment',
  );
  return {
    ...actual,
    createPaymentService: jest.fn((opts: paymentCore.CreatePaymentServiceOptions) => {
      const instance = actual.createPaymentService(opts);
      disposeSpies.push(jest.spyOn(instance, 'dispose'));
      return instance;
    }),
  };
});

jest.mock('@root/modules/payment-alipay/src', () => ({
  isAlipayNativeModuleAvailable: jest.fn(() => false),
  payWithAlipay: jest.fn(async () => ({ resultStatus: '9000', result: '' })),
}));

jest.mock('@root/modules/payment-wechat/src', () => ({
  isWechatNativeModuleAvailable: jest.fn(() => false),
  isWechatAppInstalled: jest.fn(async () => false),
  registerWechatApp: jest.fn(async () => true),
  payWithWechat: jest.fn(async () => ({ errCode: 0 })),
}));

function createMemoryKv(): KeyValueStorageDriver {
  const store = new Map<string, string | boolean>();
  return {
    getString: (key) => {
      const value = store.get(key);
      return typeof value === 'string' ? value : undefined;
    },
    setString: (key, value) => {
      store.set(key, value);
    },
    getBoolean: (key) => {
      const value = store.get(key);
      return typeof value === 'boolean' ? value : undefined;
    },
    setBoolean: (key, value) => {
      store.set(key, value);
    },
    deleteKey: (key) => {
      store.delete(key);
    },
    clearAll: () => {
      store.clear();
    },
    isEmpty: () => store.size === 0,
  };
}

function createMemorySecrets(): SecretStorageDriver {
  const store = new Map<string, string>();
  return {
    getSecret: async (key) => store.get(key) ?? null,
    setSecret: async (key, value) => {
      store.set(key, value);
    },
    deleteSecret: async (key) => {
      store.delete(key);
    },
  };
}

function createTestRuntime(options?: {
  paymentService?: PaymentService;
  privacyAccepted?: boolean;
  language?: 'zh-CN' | 'en-US';
}): AppRuntime {
  const kv = createMemoryKv();
  if (options?.privacyAccepted !== false) {
    kv.setString('compliance.accepted_privacy_version', appIdentity.privacyPolicyVersion);
  }
  return createAppRuntime({
    identity: {
      ...appIdentity,
      defaultLanguage: options?.language ?? 'zh-CN',
    },
    env: {
      appVariant: 'development',
      apiBaseUrl: 'https://api-dev.example.com',
      privacyPolicyUrl: 'https://example.com/privacy',
      userAgreementUrl: 'https://example.com/terms',
      enableDevTools: true,
      enableMockGateway: true,
    },
    translations: appTranslationResources,
    overrides: {
      keyValueStorage: kv,
      secretStorage: createMemorySecrets(),
      networkMonitor: createControllableNetworkMonitor(true),
      reconcileFreshInstall: false,
      queryPersistenceThrottleMs: 0,
      initialDeviceLocale: options?.language ?? 'zh-CN',
      capabilities: options?.paymentService
        ? { paymentService: options.paymentService }
        : undefined,
    },
  });
}

const SAMPLE_PRODUCTS: StoreProduct[] = [
  {
    productId: 'pro_monthly',
    type: 'subscription',
    title: 'Pro Monthly',
    description: 'Monthly plan',
    localizedPrice: '¥30.00 / mo',
    currencyCode: 'CNY',
  },
  {
    productId: 'pro_lifetime',
    type: 'non_consumable',
    title: 'Pro Lifetime',
    description: 'One-time purchase',
    localizedPrice: '¥198.00',
    currencyCode: 'CNY',
  },
];

function createStubPaymentService(
  overrides?: Partial<PaymentService> & {
    payImpl?: PaymentService['checkout']['pay'];
    recoverImpl?: PaymentService['checkout']['recoverPendingSessions'];
    fetchProductsImpl?: PaymentService['billing']['fetchProducts'];
    purchaseImpl?: PaymentService['billing']['purchase'];
    restoreImpl?: PaymentService['billing']['restorePurchases'];
  },
): {
  service: PaymentService;
  triggerRecovered: (outcome: PaymentOutcome) => void;
  payMock: jest.Mock<
    ReturnType<PaymentService['checkout']['pay']>,
    Parameters<PaymentService['checkout']['pay']>
  >;
} {
  let recoveryListener: ((outcome: PaymentOutcome) => void) | null = null;
  const defaultPay: PaymentService['checkout']['pay'] = async (intent) => ({
    orderId: intent.orderId,
    driverId: intent.driverId,
    channelCode: intent.channelCode,
    status: 'succeeded',
    verifiedByServer: true,
    message: 'ok',
  });
  const payMock = jest.fn<
    ReturnType<PaymentService['checkout']['pay']>,
    Parameters<PaymentService['checkout']['pay']>
  >(overrides?.payImpl ?? defaultPay);

  const service: PaymentService = {
    checkout: {
      registerDriver: jest.fn(),
      getDriver: jest.fn(),
      listDrivers: jest.fn(() => []),
      pay: (intent, opts) => payMock(intent, opts),
      recoverPendingSessions: jest.fn(overrides?.recoverImpl ?? (async () => [])),
      dispose: jest.fn(),
    },
    billing: {
      setDriver: jest.fn(),
      getDriver: jest.fn(),
      initialize: jest.fn(async () => undefined),
      fetchProducts: jest.fn(
        overrides?.fetchProductsImpl ??
          (async (_ids, type) => SAMPLE_PRODUCTS.filter((item) => item.type === type)),
      ),
      purchase: jest.fn<
        ReturnType<PaymentService['billing']['purchase']>,
        Parameters<PaymentService['billing']['purchase']>
      >(
        overrides?.purchaseImpl ??
          (async (productId): Promise<PaymentOutcome> => ({
            orderId: `IAP-${productId}`,
            driverId: 'mock_iap',
            channelCode: 'store_iap',
            status: 'succeeded',
            verifiedByServer: true,
          })),
      ),
      restorePurchases: jest.fn(overrides?.restoreImpl ?? (async () => [])),
      dispose: jest.fn(),
    },
    registerCheckoutDriver: jest.fn(),
    setBillingDriver: jest.fn(),
    resolveChannels: jest.fn(
      overrides?.resolveChannels ??
        (async (channels) => channels.map((item) => ({ ...item, available: true }))),
    ),
    initializeDrivers: jest.fn(overrides?.initializeDrivers ?? (async () => undefined)),
    createDeferredInitializer: jest.fn(() => ({
      id: 'core:payment-drivers',
      init: async () => {},
    })),
    onSessionRecovered: jest.fn((listener) => {
      recoveryListener = listener;
      return () => {
        if (recoveryListener === listener) {
          recoveryListener = null;
        }
      };
    }),
    dispose: jest.fn(overrides?.dispose ?? (() => undefined)),
  };

  return {
    service,
    triggerRecovered: (outcome) => recoveryListener?.(outcome),
    payMock,
  };
}

describe('Checkout reliability, variant return scheme & disposal lifecycle (Ticket 02)', () => {
  afterEach(() => {
    mockExpoConfig = null;
    mockNullSandboxFixtures = false;
    disposeSpies.length = 0;
    jest.restoreAllMocks();
  });

  it('derives Alipay iosScheme and Web returnUrlPrefix from variant scheme with fallback to identity.scheme', async () => {
    const { service, payMock } = createStubPaymentService();
    const runtime = createTestRuntime({ paymentService: service });

    mockExpoConfig = { scheme: 'enterprisern-dev' };

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('open-cashier-button')).toBeTruthy();
    });

    // Pay via Alipay channel under -dev scheme
    await fireEvent.press(screen.getByTestId('open-cashier-button'));
    await fireEvent.press(screen.getByTestId('cashier-channel-alipay'));
    await fireEvent.press(screen.getByTestId('cashier-confirm-pay'));

    await waitFor(() => {
      expect(payMock).toHaveBeenCalledTimes(1);
    });
    expect(payMock.mock.calls[0]?.[0]).toMatchObject({
      driverId: paymentCore.ALIPAY_DRIVER_ID,
      payload: {
        iosScheme: 'enterprisern-dev',
      },
    });

    // Switch to array scheme with -stg suffix and pay via Web H5 checkout
    mockExpoConfig = { scheme: ['  ', 'enterprisern-stg'] };
    await fireEvent.press(screen.getByTestId('open-cashier-button'));
    await fireEvent.press(screen.getByTestId('cashier-channel-paypal_web'));
    await fireEvent.press(screen.getByTestId('cashier-confirm-pay'));

    await waitFor(() => {
      expect(payMock).toHaveBeenCalledTimes(2);
    });
    expect(payMock.mock.calls[1]?.[0]).toMatchObject({
      driverId: paymentCore.WEB_CHECKOUT_DRIVER_ID,
      payload: {
        returnUrlPrefix: 'enterprisern-stg://payment/return',
      },
    });

    // Fallback to identity.scheme when Constants.expoConfig?.scheme is blank/null
    mockExpoConfig = { scheme: '   ' };
    await fireEvent.press(screen.getByTestId('open-cashier-button'));
    await fireEvent.press(screen.getByTestId('cashier-channel-paypal_web'));
    await fireEvent.press(screen.getByTestId('cashier-confirm-pay'));

    await waitFor(() => {
      expect(payMock).toHaveBeenCalledTimes(3);
    });
    expect(payMock.mock.calls[2]?.[0]).toMatchObject({
      driverId: paymentCore.WEB_CHECKOUT_DRIVER_ID,
      payload: {
        returnUrlPrefix: `${appIdentity.scheme}://payment/return`,
      },
    });
  });

  it('shows danger toast and returns early when sandbox fixtures are null in production', async () => {
    const { service, payMock } = createStubPaymentService();
    const runtime = createTestRuntime({ paymentService: service, language: 'en-US' });
    mockNullSandboxFixtures = true;

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('open-cashier-button')).toBeTruthy();
    });

    for (const channelTestId of [
      'cashier-channel-alipay',
      'cashier-channel-paypal_web',
      'cashier-channel-wechat',
    ]) {
      await fireEvent.press(screen.getByTestId('open-cashier-button'));
      await fireEvent.press(screen.getByTestId(channelTestId));
      await fireEvent.press(screen.getByTestId('cashier-confirm-pay'));
    }

    await waitFor(() => {
      expect(
        screen.getAllByText(
          'Production build stripped sandbox payment payload; configure a server order endpoint',
        ).length,
      ).toBeGreaterThan(0);
    });
    expect(payMock).not.toHaveBeenCalled();
  });

  it('transitions to localized retryable error state on driver init or catalog failure without unhandled rejections', async () => {
    let shouldFail = true;
    const { service } = createStubPaymentService({
      initializeDrivers: async () => {
        if (shouldFail) {
          throw new Error('Driver bootstrap failed');
        }
      },
    });
    const runtime = createTestRuntime({ paymentService: service, language: 'en-US' });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Checkout')).toBeTruthy();
    });
    expect(screen.getByText('Driver bootstrap failed')).toBeTruthy();

    shouldFail = false;
    await fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByTestId('open-cashier-button')).toBeTruthy();
    });
  });

  it('transitions to retryable error state when fetchProducts rejects', async () => {
    const { service } = createStubPaymentService({
      fetchProductsImpl: async () => {
        throw new Error('Catalog unavailable');
      },
    });
    const runtime = createTestRuntime({ paymentService: service, language: 'zh-CN' });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('收银台初始化失败')).toBeTruthy();
    });
    expect(screen.getByText('Catalog unavailable')).toBeTruthy();
    expect(screen.getByText('重试')).toBeTruthy();
  });

  it('does not spin in loading state when mounted before privacy consent', async () => {
    const { service } = createStubPaymentService();
    const runtime = createTestRuntime({ paymentService: service, privacyAccepted: false });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    expect(screen.queryByTestId('page-template-loading')).toBeNull();
    expect(service.initializeDrivers).not.toHaveBeenCalled();
  });

  it('does not dispose memoized paymentService when active userId changes, and disposes only on unmount', async () => {
    const runtime = createTestRuntime({ language: 'zh-CN' });
    const view = await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('open-cashier-button')).toBeTruthy();
    });

    const disposeSpy = disposeSpies[disposeSpies.length - 1];
    expect(disposeSpy).toBeDefined();
    expect(disposeSpy).not.toHaveBeenCalled();

    await act(async () => {
      runtime.authSessionStore.setState({
        status: 'authenticated',
        user: { id: 'user-alpha', username: 'alpha', displayName: 'Alpha' },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('open-cashier-button')).toBeTruthy();
    });
    expect(disposeSpy).not.toHaveBeenCalled();

    await act(async () => {
      runtime.authSessionStore.setState({
        status: 'authenticated',
        user: { id: 'user-beta', username: 'beta', displayName: 'Beta' },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('open-cashier-button')).toBeTruthy();
    });
    expect(disposeSpy).not.toHaveBeenCalled();

    await view.unmount();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('handles checkout/purchase/restore rejections and recovery events cleanly', async () => {
    const { service, triggerRecovered } = createStubPaymentService({
      payImpl: async () => {
        throw new Error('Pay gateway timeout');
      },
      purchaseImpl: async () => {
        throw new Error('Store unavailable');
      },
      restoreImpl: async () => {
        throw new Error('Restore failed');
      },
    });
    const runtime = createTestRuntime({ paymentService: service, language: 'en-US' });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('iap-purchase-pro_monthly')).toBeTruthy();
    });

    // Checkout error
    await fireEvent.press(screen.getByTestId('open-cashier-button'));
    await fireEvent.press(screen.getByTestId('cashier-channel-alipay'));
    await fireEvent.press(screen.getByTestId('cashier-confirm-pay'));

    await waitFor(() => {
      expect(screen.getByText('Payment failed: Pay gateway timeout')).toBeTruthy();
    });

    // Subscription purchase error
    await fireEvent.press(screen.getByTestId('iap-purchase-pro_monthly'));
    await waitFor(() => {
      expect(screen.getByText('Subscription failed: Store unavailable')).toBeTruthy();
    });

    // Restore purchases error
    await fireEvent.press(screen.getByTestId('iap-restore-button'));
    await waitFor(() => {
      expect(screen.getByText('Failed to restore purchases: Restore failed')).toBeTruthy();
    });

    // Recovery callback
    await act(async () => {
      triggerRecovered({
        orderId: 'ORD-REC-1',
        driverId: paymentCore.WEB_CHECKOUT_DRIVER_ID,
        channelCode: 'paypal_web',
        status: 'succeeded',
        verifiedByServer: true,
        message: 'Recovered',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('payment-outcome-card')).toBeTruthy();
    });
    expect(screen.getByText('Recovered pending order ORD-REC-1: succeeded')).toBeTruthy();
  });

  it('covers wechat checkout, lifetime purchase, restore success, and debug sandbox panel', async () => {
    const { service, payMock } = createStubPaymentService({
      restoreImpl: async () => [
        {
          orderId: 'IAP-RESTORE-1',
          driverId: 'mock_iap',
          channelCode: 'store_iap',
          status: 'succeeded',
          verifiedByServer: true,
        },
      ],
    });
    const runtime = createTestRuntime({ paymentService: service, language: 'en-US' });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('iap-restore-button')).toBeTruthy();
    });

    // Expand debug panel
    await fireEvent.press(screen.getByText('Debug & Sandbox Options (Non-Production Only)'));
    expect(screen.getByText('Alipay Bridge: Not Linked · WeChat Bridge: Not Linked')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('open-cashier-button'));
    await fireEvent.press(screen.getByTestId('cashier-channel-wechat'));
    await fireEvent.press(screen.getByTestId('cashier-confirm-pay'));

    await waitFor(() => {
      expect(payMock).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByTestId('iap-purchase-pro_lifetime'));
    await waitFor(() => {
      expect(screen.getByText('Subscription activated & verified: IAP-pro_lifetime')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('iap-restore-button'));
    await waitFor(() => {
      expect(screen.getByText('Restored 1 active subscription(s)')).toBeTruthy();
    });
  });

  it('covers sandbox helper exports and PaymentCashierSheet unavailable reasons', async () => {
    const verifier = createCheckoutSandboxVerifier();
    await expect(verifier.verifyCheckoutOrder('ORD-1')).resolves.toMatchObject({ status: 'paid' });
    await expect(
      verifier.verifyStoreTransaction?.({
        transactionId: 'tx-1',
        productId: 'pro_monthly',
        purchaseTokenOrReceipt: 'receipt',
        platform: 'ios',
      }),
    ).resolves.toMatchObject({ verified: true, orderId: 'IAP-tx-1' });

    const fixtures = getSandboxCheckoutFixtures();
    expect(fixtures).not.toBeNull();
    expect(fixtures?.alipayOrderInfo).toContain('SANDBOX_SIGN');
    expect(fixtures?.iapProducts).toHaveLength(2);

    const unlinked = createSandboxFallbackDrivers({ alipayLinked: false, wechatLinked: false });
    expect(unlinked.alipayDriver).toBeDefined();
    expect(unlinked.wechatDriver).toBeDefined();
    expect(unlinked.billingDriver).toBeDefined();

    const linked = createSandboxFallbackDrivers({ alipayLinked: true, wechatLinked: true });
    expect(linked.alipayDriver).toBeUndefined();
    expect(linked.wechatDriver).toBeUndefined();
    expect(linked.billingDriver).toBeDefined();

    const runtime = createTestRuntime({ language: 'en-US' });
    const onConfirm = jest.fn();
    await render(
      <AppRuntimeProvider runtime={runtime}>
        <PaymentCashierSheet
          visible
          amountLabel="¥199.00"
          orderTitle="Order"
          channels={[
            {
              channelCode: 'alipay',
              driverId: 'alipay',
              displayName: 'Alipay',
              available: true,
              iconKey: 'alipay',
              gatewayTag: 'SDK',
            },
            {
              channelCode: 'wechat',
              driverId: 'wechat',
              displayName: 'WeChat',
              available: false,
              unavailableReason: 'APP_NOT_INSTALLED',
              iconKey: 'wechat',
            },
            {
              channelCode: 'card',
              driverId: 'card',
              displayName: 'Card',
              available: false,
              unavailableReason: 'DRIVER_NOT_REGISTERED',
              iconKey: 'card',
            },
            {
              channelCode: 'iap',
              driverId: 'iap',
              displayName: 'IAP',
              available: false,
              unavailableReason: 'NOT_SUPPORTED',
            },
            {
              channelCode: 'other',
              driverId: 'other',
              displayName: 'Other',
              available: false,
            },
          ]}
          onClose={jest.fn()}
          onConfirm={onConfirm}
        />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('App not installed')).toBeTruthy();
    expect(screen.getByText('Not integrated in this build')).toBeTruthy();
    expect(screen.getByText('Not supported on this device')).toBeTruthy();
    expect(screen.getByText('Currently unavailable')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('cashier-confirm-pay'));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ channelCode: 'alipay' }));
  });
});

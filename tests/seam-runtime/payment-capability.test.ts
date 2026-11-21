import {
  createMockBillingDriver,
  createMockCheckoutDriver,
  createPaymentService,
  createWebCheckoutDriver,
  createZeroAmountDriver,
  type PaymentEvent,
  type PaymentOutcome,
  type RemotePaymentChannel,
  type ServerOrderVerifier,
  type StorePurchaseTransaction,
} from '@/core/capabilities/payment';
import { createMemoryKeyValueStorage } from '@/core/storage/memory-storage';
import { createTestRuntime } from '../helpers/create-test-runtime';

function createFakeAppState() {
  let state: 'active' | 'background' | 'inactive' = 'active';
  const listeners = new Set<(next: 'active' | 'background' | 'inactive') => void>();
  return {
    getCurrentState: () => state,
    subscribe: (listener: (next: 'active' | 'background' | 'inactive') => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (next: 'active' | 'background' | 'inactive') => {
      state = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
  };
}

function createFakeUrlBridge() {
  const openedUrls: string[] = [];
  const listeners = new Set<(url: string) => void>();
  return {
    openedUrls,
    openUrl: async (url: string) => {
      openedUrls.push(url);
    },
    subscribeUrl: (listener: (url: string) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emitReturnUrl: (url: string) => {
      for (const listener of listeners) {
        listener(url);
      }
    },
  };
}

describe('Payment Capability Module (seam-runtime)', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('defers driver initialization and unfinished IAP subscription until Privacy Gate consent', async () => {
    const kv = createMemoryKeyValueStorage();
    let checkoutInitCount = 0;
    let billingInitCount = 0;
    let unfinishedSubscribed = false;

    const mockCheckout = createMockCheckoutDriver({
      driverId: 'wechat_sdk',
      onInitialize: () => {
        checkoutInitCount += 1;
      },
    });
    const mockBilling = createMockBillingDriver({
      driverId: 'mock_iap',
      onInitialize: () => {
        billingInitCount += 1;
      },
      onSubscribeUnfinished: () => {
        unfinishedSubscribed = true;
      },
    });

    const verifier: ServerOrderVerifier = {
      verifyCheckoutOrder: async () => ({ status: 'paid' }),
      verifyStoreTransaction: async () => ({ verified: true, shouldFinishTransaction: true }),
    };

    const payment = createPaymentService({
      keyValueStorage: kv,
      verifier,
      checkoutDrivers: [mockCheckout],
      billingDriver: mockBilling,
    });

    const runtime = createTestRuntime({
      deferredInitializers: [payment.createDeferredInitializer()],
      overrides: {
        keyValueStorage: kv,
      },
    });

    expect(runtime.privacyGateStore.getState().phase).toBe('awaiting-consent');
    expect(checkoutInitCount).toBe(0);
    expect(billingInitCount).toBe(0);
    expect(unfinishedSubscribed).toBe(false);

    runtime.privacyGateStore.getState().acceptPrivacyPolicy();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(checkoutInitCount).toBe(1);
    expect(billingInitCount).toBe(1);
    expect(unfinishedSubscribed).toBe(true);
    payment.dispose();
  });

  it('intersects backend remote channels with registered and locally available drivers (hide vs disable)', async () => {
    const kv = createMemoryKeyValueStorage();
    const wechatUnavailable = createMockCheckoutDriver({
      driverId: 'wechat_sdk',
      available: false,
    });
    const alipayAvailable = createMockCheckoutDriver({
      driverId: 'alipay_sdk',
      available: true,
    });

    const payment = createPaymentService({
      keyValueStorage: kv,
      verifier: { verifyCheckoutOrder: async () => ({ status: 'paid' }) },
      checkoutDrivers: [wechatUnavailable, alipayAvailable, createZeroAmountDriver()],
    });

    const remoteChannels: RemotePaymentChannel[] = [
      {
        channelCode: 'alipay',
        driverId: 'alipay_sdk',
        displayName: '支付宝',
        gatewayTag: 'lakala',
      },
      {
        channelCode: 'wechat',
        driverId: 'wechat_sdk',
        displayName: '微信支付',
        unavailablePolicy: 'disable',
      },
      {
        channelCode: 'apple_pay',
        driverId: 'stripe_apple_pay',
        displayName: 'Apple Pay',
        unavailablePolicy: 'hide',
      },
      {
        channelCode: 'unionpay',
        driverId: 'unionpay_sdk',
        displayName: '云闪付',
        unavailablePolicy: 'disable',
      },
    ];

    const resolved = await payment.resolveChannels(remoteChannels);

    expect(resolved).toHaveLength(3);
    expect(resolved[0]).toMatchObject({
      channelCode: 'alipay',
      available: true,
      gatewayTag: 'lakala',
    });
    expect(resolved[1]).toMatchObject({
      channelCode: 'wechat',
      available: false,
      unavailableReason: 'APP_NOT_INSTALLED',
    });
    expect(resolved[2]).toMatchObject({
      channelCode: 'unionpay',
      available: false,
      unavailableReason: 'DRIVER_NOT_REGISTERED',
    });
    payment.dispose();
  });

  it('enforces single-flight lock, supports zero-amount bypass, channel switch after cancel, and redacts sensitive logs', async () => {
    const kv = createMemoryKeyValueStorage();
    const events: PaymentEvent[] = [];
    let releasePendingPay!: () => void;

    const slowWechat = createMockCheckoutDriver({
      driverId: 'wechat_sdk',
      execute: () =>
        new Promise((resolve) => {
          releasePendingPay = () => resolve({ status: 'cancelled', errorCode: 'CANCELLED' });
        }),
    });
    const alipayOk = createMockCheckoutDriver({
      driverId: 'alipay_sdk',
      nextResult: { status: 'completed' },
    });

    const payment = createPaymentService({
      keyValueStorage: kv,
      verifier: {
        verifyCheckoutOrder: async () => ({ status: 'paid' }),
      },
      checkoutDrivers: [slowWechat, alipayOk, createZeroAmountDriver()],
      onEvent: (event) => events.push(event),
    });

    // 1. Start first payment and verify concurrent second call is rejected
    const firstPromise = payment.checkout.pay(
      {
        orderId: 'ORD-100',
        channelCode: 'wechat',
        driverId: 'wechat_sdk',
        payload: { sign: 'TOP_SECRET_SIGNATURE_VALUE' },
      },
      { userId: 'u1' },
    );

    const concurrentResult = await payment.checkout.pay(
      {
        orderId: 'ORD-101',
        channelCode: 'alipay',
        driverId: 'alipay_sdk',
        payload: { orderString: 'SECRET_ALIPAY_STRING' },
      },
      { userId: 'u1' },
    );
    expect(concurrentResult.status).toBe('failed');
    expect(concurrentResult.errorCode).toBe('PAYMENT_IN_PROGRESS');
    expect(concurrentResult.verifiedByServer).toBe(false);

    // 2. Cancel first payment, then switch channel on same orderId
    releasePendingPay();
    const cancelled = await firstPromise;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.errorCode).toBe('CANCELLED');

    const switched = await payment.checkout.pay(
      {
        orderId: 'ORD-100',
        channelCode: 'alipay',
        driverId: 'alipay_sdk',
        payload: { orderString: 'SECRET_ALIPAY_STRING' },
      },
      { userId: 'u1' },
    );
    expect(switched.status).toBe('succeeded');
    expect(switched.verifiedByServer).toBe(true);

    // 3. Zero-amount order bypasses external UI and verifies with backend
    const zeroResult = await payment.checkout.pay(
      {
        orderId: 'ORD-ZERO',
        channelCode: 'coupon_free',
        driverId: 'zero_amount',
        payload: null,
      },
      { userId: 'u1' },
    );
    expect(zeroResult.status).toBe('succeeded');
    expect(zeroResult.verifiedByServer).toBe(true);

    // 4. Redaction check: no sensitive payload strings ever appear in emitted events
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('TOP_SECRET_SIGNATURE_VALUE');
    expect(serialized).not.toContain('SECRET_ALIPAY_STRING');
    payment.dispose();
  });

  it('completes generic Web/H5 checkout via Deep Link return URL and handles cancel return', async () => {
    const kv = createMemoryKeyValueStorage();
    const urlBridge = createFakeUrlBridge();
    const webDriver = createWebCheckoutDriver({
      openUrl: urlBridge.openUrl,
      subscribeUrl: urlBridge.subscribeUrl,
    });

    const payment = createPaymentService({
      keyValueStorage: kv,
      verifier: {
        verifyCheckoutOrder: async (orderId) =>
          orderId === 'ORD-H5-OK' ? { status: 'paid' } : { status: 'pending' },
      },
      checkoutDrivers: [webDriver],
    });

    // Success flow
    const payPromise = payment.checkout.pay(
      {
        orderId: 'ORD-H5-OK',
        channelCode: 'paypal_web',
        driverId: 'web_checkout',
        payload: {
          checkoutUrl: 'https://checkout.secondary-gateway.example/pay?order=ORD-H5-OK',
          returnUrlPrefix: 'myapp://payment/return',
        },
      },
      { userId: 'u1' },
    );

    await Promise.resolve();
    expect(urlBridge.openedUrls[0]).toContain('ORD-H5-OK');

    urlBridge.emitReturnUrl('myapp://payment/return?orderId=ORD-H5-OK&status=success');
    const okResult = await payPromise;
    expect(okResult.status).toBe('succeeded');
    expect(okResult.verifiedByServer).toBe(true);

    // Cancelled return flow
    const cancelPromise = payment.checkout.pay(
      {
        orderId: 'ORD-H5-CANCEL',
        channelCode: 'paypal_web',
        driverId: 'web_checkout',
        payload: {
          checkoutUrl: 'https://checkout.secondary-gateway.example/pay?order=ORD-H5-CANCEL',
          returnUrlPrefix: 'myapp://payment/return',
        },
      },
      { userId: 'u1' },
    );

    await Promise.resolve();
    urlBridge.emitReturnUrl('myapp://payment/return?orderId=ORD-H5-CANCEL&status=cancelled');
    const cancelResult = await cancelPromise;
    expect(cancelResult.status).toBe('cancelled');
    expect(cancelResult.errorCode).toBe('CANCELLED');
    payment.dispose();
  });

  it('recovers when user returns to foreground without SDK callback (AppState grace period + backoff polling)', async () => {
    jest.useFakeTimers();
    const kv = createMemoryKeyValueStorage();
    const appState = createFakeAppState();
    let verifyCalls = 0;

    // Driver never resolves (simulates silent WeChat/Alipay return)
    const silentDriver = createMockCheckoutDriver({
      driverId: 'wechat_sdk',
      execute: () => new Promise(() => {}),
    });

    const payment = createPaymentService({
      keyValueStorage: kv,
      appStateWatcher: appState,
      foregroundGraceMs: 1500,
      pollBackoffMs: [100, 200],
      verifier: {
        verifyCheckoutOrder: async () => {
          verifyCalls += 1;
          return verifyCalls >= 2 ? { status: 'paid' } : { status: 'pending' };
        },
      },
      checkoutDrivers: [silentDriver],
    });

    const payPromise = payment.checkout.pay(
      {
        orderId: 'ORD-SILENT',
        channelCode: 'wechat',
        driverId: 'wechat_sdk',
        payload: {},
      },
      { userId: 'u1' },
    );

    // Allow isAvailable() microtask to finish and subscribe AppState before user switches app
    await Promise.resolve();
    appState.emit('background');
    appState.emit('active');

    await jest.advanceTimersByTimeAsync(1500);
    await jest.advanceTimersByTimeAsync(150);

    const outcome = await payPromise;
    expect(outcome.status).toBe('succeeded');
    expect(outcome.verifiedByServer).toBe(true);
    expect(verifyCalls).toBe(2);
    payment.dispose();
  });

  it('reconciles persisted pending session on cold start, isolates by userId, and discards expired TTL sessions', async () => {
    const kv = createMemoryKeyValueStorage();
    let now = 1_700_000_000_000;

    // First process: start payment that never finishes before OS kills the app
    const silentDriver = createMockCheckoutDriver({
      driverId: 'alipay_sdk',
      execute: () => new Promise(() => {}),
    });

    const firstProcessPayment = createPaymentService({
      keyValueStorage: kv,
      now: () => now,
      verifier: { verifyCheckoutOrder: async () => ({ status: 'pending' }) },
      checkoutDrivers: [silentDriver],
    });

    void firstProcessPayment.checkout.pay(
      {
        orderId: 'ORD-KILLED',
        channelCode: 'alipay',
        driverId: 'alipay_sdk',
        payload: {},
        expiresAt: now + 10 * 60 * 1000,
      },
      { userId: 'user-A' },
    );
    await Promise.resolve();
    firstProcessPayment.dispose();

    // Second process (cold start): wrong user sees nothing
    const recoveredOutcomes: PaymentOutcome[] = [];
    const secondProcessPayment = createPaymentService({
      keyValueStorage: kv,
      now: () => now + 60_000,
      verifier: { verifyCheckoutOrder: async () => ({ status: 'paid' }) },
      checkoutDrivers: [silentDriver],
    });
    secondProcessPayment.onSessionRecovered((outcome) => recoveredOutcomes.push(outcome));

    const wrongUserRecovered = await secondProcessPayment.checkout.recoverPendingSessions({
      userId: 'user-B',
    });
    expect(wrongUserRecovered).toHaveLength(0);
    expect(recoveredOutcomes).toHaveLength(0);

    // Correct user recovers and clears persisted session
    const rightUserRecovered = await secondProcessPayment.checkout.recoverPendingSessions({
      userId: 'user-A',
    });
    expect(rightUserRecovered).toHaveLength(1);
    expect(rightUserRecovered[0]).toMatchObject({
      orderId: 'ORD-KILLED',
      status: 'succeeded',
      verifiedByServer: true,
    });
    expect(recoveredOutcomes).toHaveLength(1);

    // Subsequent recovery yields nothing because session was cleared
    const secondTry = await secondProcessPayment.checkout.recoverPendingSessions({
      userId: 'user-A',
    });
    expect(secondTry).toHaveLength(0);

    // Expired session is silently discarded without hitting backend
    let verifyCalledOnExpired = false;
    const thirdProcess = createPaymentService({
      keyValueStorage: kv,
      now: () => now,
      verifier: {
        verifyCheckoutOrder: async () => {
          verifyCalledOnExpired = true;
          return { status: 'paid' };
        },
      },
      checkoutDrivers: [silentDriver],
    });
    void thirdProcess.checkout.pay(
      {
        orderId: 'ORD-EXPIRED',
        channelCode: 'alipay',
        driverId: 'alipay_sdk',
        payload: {},
        expiresAt: now + 1_000,
      },
      { userId: 'user-A' },
    );
    await Promise.resolve();
    thirdProcess.dispose();

    now += 5_000;
    const fourthProcess = createPaymentService({
      keyValueStorage: kv,
      now: () => now,
      verifier: {
        verifyCheckoutOrder: async () => {
          verifyCalledOnExpired = true;
          return { status: 'paid' };
        },
      },
      checkoutDrivers: [silentDriver],
    });
    const expiredResult = await fourthProcess.checkout.recoverPendingSessions({
      userId: 'user-A',
    });
    expect(expiredResult).toHaveLength(0);
    expect(verifyCalledOnExpired).toBe(false);

    secondProcessPayment.dispose();
    fourthProcess.dispose();
  });

  it('handles IAP products, purchase, restore, unfinished transaction recovery, and refuses to finish unverified transactions', async () => {
    const kv = createMemoryKeyValueStorage();
    const events: PaymentEvent[] = [];
    const finishedTxIds: string[] = [];

    const mockBilling = createMockBillingDriver({
      driverId: 'expo_iap',
      products: [
        {
          productId: 'pro_monthly',
          type: 'subscription',
          title: 'Pro 月度会员',
          description: '解锁全部高级功能',
          localizedPrice: '¥30.00',
          currencyCode: 'CNY',
          subscriptionPeriod: 'P1M',
        },
      ],
      onFinishTransaction: (tx) => {
        finishedTxIds.push(tx.transactionId);
      },
    });

    let allowFinish = false;
    const payment = createPaymentService({
      keyValueStorage: kv,
      billingDriver: mockBilling,
      onEvent: (event) => events.push(event),
      verifier: {
        verifyCheckoutOrder: async () => ({ status: 'paid' }),
        verifyStoreTransaction: async (tx) => ({
          verified: allowFinish,
          shouldFinishTransaction: allowFinish,
          orderId: `IAP-${tx.transactionId}`,
          message: allowFinish ? 'ok' : 'backend busy',
        }),
      },
    });

    await payment.initializeDrivers();

    const products = await payment.billing.fetchProducts(['pro_monthly'], 'subscription');
    expect(products).toHaveLength(1);
    expect(products[0]?.localizedPrice).toBe('¥30.00');

    // 1. Backend refuses verification -> MUST NOT call finishTransaction
    allowFinish = false;
    const denied = await payment.billing.purchase('pro_monthly', {
      appAccountToken: 'user-A',
      isConsumable: false,
    });
    expect(denied.status).toBe('failed');
    expect(denied.errorCode).toBe('RECEIPT_VERIFY_FAILED');
    expect(finishedTxIds).toHaveLength(0);

    // 2. Backend approves -> calls finishTransaction and returns succeeded
    allowFinish = true;
    const approved = await payment.billing.purchase('pro_monthly', {
      appAccountToken: 'user-A',
      isConsumable: false,
    });
    expect(approved.status).toBe('succeeded');
    expect(approved.verifiedByServer).toBe(true);
    expect(finishedTxIds).toHaveLength(1);

    // 3. Unfinished transaction pushed by store automatically verifies & finishes
    const droppedTx: StorePurchaseTransaction = {
      transactionId: 'tx-dropped-99',
      productId: 'pro_monthly',
      purchaseTokenOrReceipt: 'RAW_APPLE_JWS_SECRET_RECEIPT',
      platform: 'ios',
    };
    const recovered: PaymentOutcome[] = [];
    payment.onSessionRecovered((outcome) => recovered.push(outcome));

    mockBilling.emitUnfinishedTransaction(droppedTx);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(finishedTxIds).toContain('tx-dropped-99');
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.status).toBe('succeeded');

    // 4. Restore purchases verifies active entitlements
    const restored = await payment.billing.restorePurchases();
    expect(restored.length).toBeGreaterThanOrEqual(1);
    expect(restored[0]?.verifiedByServer).toBe(true);

    // 5. Raw receipt is never leaked in telemetry events
    expect(JSON.stringify(events)).not.toContain('RAW_APPLE_JWS_SECRET_RECEIPT');
    payment.dispose();
  });

  it('rejects non-https web checkout URLs, unsubscribes URL listener on foreground fallback, retries transient verify errors, and shares single-flight lock with IAP', async () => {
    jest.useFakeTimers();
    const kv = createMemoryKeyValueStorage();
    const appState = createFakeAppState();
    let activeUrlListeners = 0;
    const urlBridge = {
      openUrl: async () => {},
      subscribeUrl: (listener: (url: string) => void) => {
        activeUrlListeners += 1;
        void listener;
        return () => {
          activeUrlListeners -= 1;
        };
      },
    };

    const webDriver = createWebCheckoutDriver({
      openUrl: urlBridge.openUrl,
      subscribeUrl: urlBridge.subscribeUrl,
    });
    const mockBilling = createMockBillingDriver({
      driverId: 'expo_iap',
      products: [
        {
          productId: 'pro_monthly',
          type: 'subscription',
          title: 'Pro',
          description: 'Pro',
          localizedPrice: '¥30.00',
          currencyCode: 'CNY',
        },
      ],
    });

    let verifyAttempts = 0;
    const payment = createPaymentService({
      keyValueStorage: kv,
      appStateWatcher: appState,
      foregroundGraceMs: 500,
      pollBackoffMs: [100, 200],
      checkoutDrivers: [webDriver],
      billingDriver: mockBilling,
      verifier: {
        verifyCheckoutOrder: async () => {
          verifyAttempts += 1;
          if (verifyAttempts === 1) {
            throw new Error('transient socket reset');
          }
          return { status: 'paid' };
        },
        verifyStoreTransaction: async () => ({ verified: true, shouldFinishTransaction: true }),
      },
    });

    // 1. Non-https URL rejected with INVALID_PAYLOAD
    const badUrl = await payment.checkout.pay(
      {
        orderId: 'ORD-XSS',
        channelCode: 'paypal_web',
        driverId: 'web_checkout',
        payload: { checkoutUrl: 'javascript:alert(1)', returnUrlPrefix: 'myapp://pay' },
      },
      { userId: 'u1' },
    );
    expect(badUrl.status).toBe('failed');
    expect(badUrl.errorCode).toBe('INVALID_PAYLOAD');

    // 2. Start abandoned web checkout; verify shared lock blocks concurrent IAP purchase
    const webPromise = payment.checkout.pay(
      {
        orderId: 'ORD-WEB-ABANDONED',
        channelCode: 'paypal_web',
        driverId: 'web_checkout',
        payload: {
          checkoutUrl: 'https://checkout.example.com/pay',
          returnUrlPrefix: 'myapp://pay',
        },
      },
      { userId: 'u1' },
    );
    await Promise.resolve();
    expect(activeUrlListeners).toBe(1);

    const blockedIap = await payment.billing.purchase('pro_monthly');
    expect(blockedIap.status).toBe('failed');
    expect(blockedIap.errorCode).toBe('PAYMENT_IN_PROGRESS');

    // 3. User switches back manually -> grace period fires -> URL listener cleaned up -> transient verify error retried -> paid
    appState.emit('background');
    appState.emit('active');
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(150);

    const webOutcome = await webPromise;
    expect(webOutcome.status).toBe('succeeded');
    expect(verifyAttempts).toBe(2);
    expect(activeUrlListeners).toBe(0);

    payment.dispose();
  });

  it('continues recovering remaining pending sessions when one order verification throws', async () => {
    const kv = createMemoryKeyValueStorage();
    const now = 1_700_000_000_000;
    const silentDriver = createMockCheckoutDriver({
      driverId: 'alipay_sdk',
      execute: () => new Promise(() => {}),
    });

    // Seed two pending sessions directly via two processes
    const p1 = createPaymentService({
      keyValueStorage: kv,
      now: () => now,
      verifier: { verifyCheckoutOrder: async () => ({ status: 'pending' }) },
      checkoutDrivers: [silentDriver],
    });
    void p1.checkout.pay(
      { orderId: 'ORD-ERR-1', channelCode: 'alipay', driverId: 'alipay_sdk', payload: {} },
      { userId: 'u1' },
    );
    await Promise.resolve();
    p1.dispose();

    const p2 = createPaymentService({
      keyValueStorage: kv,
      now: () => now,
      verifier: { verifyCheckoutOrder: async () => ({ status: 'pending' }) },
      checkoutDrivers: [silentDriver],
    });
    void p2.checkout.pay(
      { orderId: 'ORD-OK-2', channelCode: 'alipay', driverId: 'alipay_sdk', payload: {} },
      { userId: 'u1' },
    );
    await Promise.resolve();
    p2.dispose();

    const recoveryService = createPaymentService({
      keyValueStorage: kv,
      now: () => now + 1000,
      checkoutDrivers: [silentDriver],
      verifier: {
        verifyCheckoutOrder: async (orderId) => {
          if (orderId === 'ORD-ERR-1') {
            throw new Error('503 gateway unavailable');
          }
          return { status: 'paid' };
        },
      },
    });

    const recovered = await recoveryService.checkout.recoverPendingSessions({ userId: 'u1' });
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.orderId).toBe('ORD-OK-2');
    expect(recovered[0]?.status).toBe('succeeded');
    recoveryService.dispose();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { createPendingSessionStore } from '@/core/capabilities/payment';
import { AppRuntimeProvider } from '@/core/runtime';
import { CheckoutScreen } from '@/features/payment';
import { createTestRuntime } from '../helpers/create-test-runtime';

describe('CheckoutScreen & PaymentCashierSheet (seam-runtime)', () => {
  it('opens cashier sheet, filters unavailable channels, completes checkout, and runs IAP purchase & restore', async () => {
    const runtime = createTestRuntime();
    runtime.privacyGateStore.getState().acceptPrivacyPolicy();

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    // Wait for store products and resolved channels to load
    await waitFor(() => {
      expect(screen.getByText('¥30.00 / 月')).toBeTruthy();
    });

    // Open cashier sheet
    await fireEvent.press(screen.getByTestId('open-cashier-button'));

    await waitFor(() => {
      expect(screen.getByText('选择支付方式')).toBeTruthy();
      expect(screen.getByText('未安装客户端')).toBeTruthy();
    });

    // Select zero-amount channel and confirm payment
    await fireEvent.press(screen.getByTestId('cashier-channel-coupon_free'));
    await fireEvent.press(screen.getByTestId('cashier-confirm-pay'));

    await waitFor(() => {
      expect(screen.getByTestId('payment-outcome-card')).toBeTruthy();
      expect(screen.getByText(/渠道：coupon_free/)).toBeTruthy();
      expect(screen.getByText(/后端已核实：是/)).toBeTruthy();
    });

    // Trigger IAP subscription purchase
    await fireEvent.press(screen.getByTestId('iap-purchase-pro_monthly'));

    await waitFor(() => {
      expect(screen.getByText(/渠道：apple_iap/)).toBeTruthy();
    });

    // Trigger restore purchases
    await fireEvent.press(screen.getByTestId('iap-restore-button'));

    await waitFor(() => {
      expect(screen.getByText(/后端已核实：是/)).toBeTruthy();
    });
  });

  it('defers payment driver initialization until Privacy Gate is ready and automatically recovers pending sessions from MMKV on mount', async () => {
    const runtime = createTestRuntime();
    const pendingStore = createPendingSessionStore(runtime.keyValueStorage);
    pendingStore.save({
      orderId: 'ORD-RECOVER-001',
      channelCode: 'alipay',
      driverId: 'alipay',
      userId: 'guest-user',
      createdAt: Date.now() - 5000,
      expiresAt: Date.now() + 60000,
    });

    await render(
      <AppRuntimeProvider runtime={runtime}>
        <CheckoutScreen />
      </AppRuntimeProvider>,
    );

    // Before privacy consent is granted, pending session is NOT recovered yet
    expect(screen.queryByText(/ORD-RECOVER-001/)).toBeNull();

    // Grant privacy consent -> CheckoutScreen initializes drivers and recovers ORD-RECOVER-001
    await act(async () => {
      runtime.privacyGateStore.getState().acceptPrivacyPolicy();
    });

    await waitFor(() => {
      expect(screen.getByTestId('payment-outcome-card')).toBeTruthy();
      expect(screen.getByText(/订单：ORD-RECOVER-001/)).toBeTruthy();
    });
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppRuntimeProvider } from '@/core/runtime';
import { CheckoutScreen } from '@/features/payment';
import { createTestRuntime } from '../helpers/create-test-runtime';

describe('CheckoutScreen & PaymentCashierSheet (seam-runtime)', () => {
  it('opens cashier sheet, filters unavailable channels, completes checkout, and runs IAP purchase & restore', async () => {
    const runtime = createTestRuntime();

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
});

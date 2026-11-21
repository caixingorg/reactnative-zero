/**
 * @module core/capabilities/payment/drivers/zero-amount-driver
 * 职责：0 元单 / 优惠券全额抵扣直通驱动——跳过外部支付拉起，直接交给协调器执行后端查单确认。
 */
import type { CheckoutDriver, DriverExecutionResult } from '../types';

export const ZERO_AMOUNT_DRIVER_ID = 'zero_amount';

export function createZeroAmountDriver(): CheckoutDriver<unknown> {
  return {
    driverId: ZERO_AMOUNT_DRIVER_ID,
    async isAvailable(): Promise<boolean> {
      return true;
    },
    async execute(): Promise<DriverExecutionResult> {
      return { status: 'completed' };
    },
  };
}

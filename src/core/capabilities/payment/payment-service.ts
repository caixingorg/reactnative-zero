/**
 * @module core/capabilities/payment/payment-service
 * 职责：全场景支付统一门面——聚合一次性支付协调器与商店内购协调器、提供渠道交集过滤、Privacy Gate 二阶段初始化与冷启恢复订阅。
 */
import type { DeferredSdkInitializer } from '../../bootstrap/privacy-gate-store';
import { createStoreBillingCoordinator, type StoreBillingCoordinator } from './billing-coordinator';
import {
  createCheckoutCoordinator,
  createPaymentConcurrencyLock,
  type CheckoutCoordinator,
} from './checkout-coordinator';
import { createPendingSessionStore } from './pending-session-store';
import type {
  CheckoutDriver,
  CreatePaymentServiceOptions,
  PaymentEvent,
  PaymentOutcome,
  RemotePaymentChannel,
  ResolvedPaymentChannel,
  StoreBillingDriver,
} from './types';

export interface PaymentService {
  readonly checkout: CheckoutCoordinator;
  readonly billing: StoreBillingCoordinator;
  registerCheckoutDriver(driver: CheckoutDriver): void;
  setBillingDriver(driver: StoreBillingDriver): void;
  resolveChannels(
    remoteChannels: readonly RemotePaymentChannel[],
  ): Promise<ResolvedPaymentChannel[]>;
  initializeDrivers(): Promise<void>;
  createDeferredInitializer(): DeferredSdkInitializer;
  onSessionRecovered(listener: (outcome: PaymentOutcome) => void): () => void;
  dispose(): void;
}

export function createPaymentService(options: CreatePaymentServiceOptions): PaymentService {
  const now = options.now ?? (() => Date.now());
  const recoveryListeners = new Set<(outcome: PaymentOutcome) => void>();
  const concurrencyLock = createPaymentConcurrencyLock();
  let driversInitialized = false;
  let initPromise: Promise<void> | null = null;

  const emitEvent = (event: Omit<PaymentEvent, 'timestamp'>): void => {
    options.onEvent?.({
      ...event,
      timestamp: now(),
    });
  };

  const emitRecovered = (outcome: PaymentOutcome): void => {
    for (const listener of recoveryListeners) {
      listener(outcome);
    }
  };

  const sessionStore = createPendingSessionStore(options.keyValueStorage);

  const checkout = createCheckoutCoordinator({
    sessionStore,
    verifier: options.verifier,
    concurrencyLock,
    appStateWatcher: options.appStateWatcher,
    foregroundGraceMs: options.foregroundGraceMs,
    defaultSessionTtlMs: options.defaultSessionTtlMs,
    pollBackoffMs: options.pollBackoffMs,
    now,
    emitEvent,
    emitRecovered,
  });

  const billing = createStoreBillingCoordinator({
    verifier: options.verifier,
    concurrencyLock,
    emitEvent,
    emitRecovered,
  });

  for (const driver of options.checkoutDrivers ?? []) {
    checkout.registerDriver(driver);
  }
  if (options.billingDriver) {
    billing.setDriver(options.billingDriver);
  }

  const initializeDrivers = async (): Promise<void> => {
    if (driversInitialized) {
      return;
    }
    if (initPromise) {
      return initPromise;
    }
    initPromise = (async () => {
      for (const driver of checkout.listDrivers()) {
        if (driver.initialize) {
          await driver.initialize();
        }
      }
      await billing.initialize();
      driversInitialized = true;
      emitEvent({ type: 'drivers_initialized' });
    })().finally(() => {
      initPromise = null;
    });

    return initPromise;
  };

  return {
    checkout,
    billing,

    registerCheckoutDriver(driver: CheckoutDriver): void {
      checkout.registerDriver(driver);
    },

    setBillingDriver(driver: StoreBillingDriver): void {
      billing.setDriver(driver);
    },

    async resolveChannels(
      remoteChannels: readonly RemotePaymentChannel[],
    ): Promise<ResolvedPaymentChannel[]> {
      const resolved: ResolvedPaymentChannel[] = [];
      const billingDriver = billing.getDriver();

      for (const remote of remoteChannels) {
        const policy = remote.unavailablePolicy ?? 'hide';
        const checkoutDriver = checkout.getDriver(remote.driverId);
        const matchedBillingDriver =
          billingDriver && billingDriver.driverId === remote.driverId ? billingDriver : undefined;

        if (!checkoutDriver && !matchedBillingDriver) {
          if (policy === 'disable') {
            resolved.push({
              ...remote,
              available: false,
              unavailableReason: 'DRIVER_NOT_REGISTERED',
            });
          }
          continue;
        }

        let available = false;
        try {
          available = checkoutDriver
            ? await checkoutDriver.isAvailable()
            : await matchedBillingDriver!.isAvailable();
        } catch {
          available = false;
        }

        if (!available) {
          if (policy === 'disable') {
            resolved.push({
              ...remote,
              available: false,
              unavailableReason: matchedBillingDriver ? 'NOT_SUPPORTED' : 'APP_NOT_INSTALLED',
            });
          }
          continue;
        }

        resolved.push({
          ...remote,
          available: true,
        });
      }

      return resolved;
    },

    initializeDrivers,

    createDeferredInitializer(): DeferredSdkInitializer {
      return {
        id: 'core:payment-drivers',
        init: initializeDrivers,
      };
    },

    onSessionRecovered(listener: (outcome: PaymentOutcome) => void): () => void {
      recoveryListeners.add(listener);
      return () => {
        recoveryListeners.delete(listener);
      };
    },

    dispose(): void {
      driversInitialized = false;
      initPromise = null;
      recoveryListeners.clear();
      checkout.dispose();
      billing.dispose();
    },
  };
}

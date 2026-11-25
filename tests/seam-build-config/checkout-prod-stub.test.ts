import fs from 'node:fs';
import path from 'node:path';
import type {
  CheckoutDriver,
  ServerOrderVerifier,
  StoreBillingDriver,
} from '@/core/capabilities/payment';
import type { SandboxCheckoutFixtures } from '@/features/payment';

interface MetroResolverConfig {
  resolver: {
    resolveRequest: (
      context: {
        resolveRequest: (
          ctx: unknown,
          name: string,
          platform: string | null,
        ) => { type: string; filePath: string };
      },
      moduleName: string,
      platform: string | null,
    ) => { type: string; filePath: string };
  };
}

interface CheckoutSandboxModule {
  createCheckoutSandboxVerifier: () => ServerOrderVerifier;
  getSandboxCheckoutFixtures: () => SandboxCheckoutFixtures | null;
  createSandboxFallbackDrivers: (options: { alipayLinked: boolean; wechatLinked: boolean }) => {
    alipayDriver?: CheckoutDriver;
    wechatDriver?: CheckoutDriver;
    billingDriver?: StoreBillingDriver;
  };
}

describe('Checkout production stub isolation (Ticket 02)', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const devSandboxPath = path.resolve(projectRoot, 'src/features/payment/checkout-sandbox.ts');
  const prodStubPath = path.resolve(projectRoot, 'src/features/payment/checkout-sandbox.prod.ts');
  const originalAppVariant = process.env.APP_VARIANT;

  afterEach(() => {
    if (originalAppVariant === undefined) {
      delete process.env.APP_VARIANT;
    } else {
      process.env.APP_VARIANT = originalAppVariant;
    }
    jest.resetModules();
  });

  it('Metro resolveRequest swaps checkout-sandbox.ts to checkout-sandbox.prod.ts under APP_VARIANT=production', () => {
    process.env.APP_VARIANT = 'production';
    jest.resetModules();
    const metroConfig = require('../../metro.config.js') as MetroResolverConfig;

    const fakeContext = {
      resolveRequest: () => ({
        type: 'sourceFile',
        filePath: devSandboxPath,
      }),
    };

    const resolved = metroConfig.resolver.resolveRequest(fakeContext, '../checkout-sandbox', 'ios');
    expect(resolved).toEqual({
      type: 'sourceFile',
      filePath: prodStubPath,
    });
  });

  it('Metro resolveRequest keeps checkout-sandbox.ts untouched in non-production variants', () => {
    process.env.APP_VARIANT = 'staging';
    jest.resetModules();
    const metroConfig = require('../../metro.config.js') as MetroResolverConfig;

    const fakeContext = {
      resolveRequest: () => ({
        type: 'sourceFile',
        filePath: devSandboxPath,
      }),
    };

    const resolved = metroConfig.resolver.resolveRequest(
      fakeContext,
      '../checkout-sandbox',
      'android',
    );
    expect(resolved).toEqual({
      type: 'sourceFile',
      filePath: devSandboxPath,
    });
  });

  it('production stub explicitly rejects verification, returns null fixtures, and returns empty fallback drivers', async () => {
    const prodStub =
      require('../../src/features/payment/checkout-sandbox.prod') as CheckoutSandboxModule;

    expect(prodStub.getSandboxCheckoutFixtures()).toBeNull();
    expect(
      prodStub.createSandboxFallbackDrivers({ alipayLinked: false, wechatLinked: false }),
    ).toEqual({});

    const verifier = prodStub.createCheckoutSandboxVerifier();
    await expect(verifier.verifyCheckoutOrder('ORD-PROD-1')).rejects.toThrow(/production/i);
    await expect(
      verifier.verifyStoreTransaction?.({
        transactionId: 'TX-PROD-1',
        productId: 'pro_monthly',
        purchaseTokenOrReceipt: 'receipt',
        platform: 'ios',
      }),
    ).rejects.toThrow(/production/i);

    const stubSource = fs.readFileSync(prodStubPath, 'utf8');
    expect(stubSource).not.toContain("'paid'");
    expect(stubSource).not.toContain('verified: true');
    expect(stubSource).not.toContain('SANDBOX_SIGN');
    expect(stubSource).not.toContain('SANDBOX_WECHAT_SIGN');
    expect(stubSource).not.toContain('opendocs.alipay.com');
  });

  it('CONTEXT.md build-time production stub inventory lists checkout-sandbox.ts -> checkout-sandbox.prod.ts', () => {
    const contextDoc = fs.readFileSync(path.resolve(projectRoot, 'CONTEXT.md'), 'utf8');
    expect(contextDoc).toContain(
      '`src/features/payment/checkout-sandbox.ts` → `checkout-sandbox.prod.ts`',
    );
  });
});

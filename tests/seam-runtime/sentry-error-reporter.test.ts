import { appIdentity } from '@root/app.identity';
import { createObservabilitySuite } from '@/core/observability/observability';
import { createSentryErrorReporter, type SentryClientLike } from '@/core/vendors';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

function fakeClient() {
  const calls = { init: 0, close: 0, captured: [] as unknown[] };
  const client: SentryClientLike = {
    init: () => {
      calls.init += 1;
    },
    captureException: (error) => {
      calls.captured.push(error);
    },
    close: () => {
      calls.close += 1;
    },
  };
  return { client, calls };
}

describe('Seam: Sentry-protocol error reporter adapter is off by default and consent-gated', () => {
  it('is disabled when no DSN is configured', () => {
    const { client, calls } = fakeClient();
    expect(createSentryErrorReporter({ client })).toBeUndefined();
    expect(createSentryErrorReporter({ client, dsn: '   ' })).toBeUndefined();
    expect(calls.init).toBe(0);
  });

  it('never initializes the client before privacy consent', () => {
    const { client, calls } = fakeClient();
    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: { requirePrivacyConsent: true, requirePermissionRationale: true },
      },
      env: TEST_RUNTIME_ENV,
      observability: {
        errorReporter: createSentryErrorReporter({
          client,
          dsn: 'https://key@sentry.example.com/1',
        }),
      },
      overrides: {
        keyValueStorage: createMemoryKeyValueStorage(),
        secretStorage: createMemorySecretStorage(),
      },
    });

    runtime.errorReporter.captureException(new Error('before consent'));

    expect(calls.init).toBe(0);
    expect(calls.captured).toHaveLength(0);
  });

  it('delivers thrown errors after consent without default PII and closes on revoke', async () => {
    const { client, calls } = fakeClient();
    const initOptions: unknown[] = [];
    const recording: SentryClientLike = {
      ...client,
      init: (options) => {
        initOptions.push(options);
        client.init(options);
      },
    };
    const suite = createObservabilitySuite({
      errorReporter: createSentryErrorReporter({
        client: recording,
        dsn: 'https://key@sentry.example.com/1',
        environment: 'staging',
      }),
    });

    await suite.errorReporter.initialize();
    const boom = new Error('boom');
    suite.errorReporter.captureException(boom, { screen: 'feed' });

    expect(calls.init).toBe(1);
    expect(initOptions[0]).toMatchObject({ sendDefaultPii: false, tracesSampleRate: 0 });
    expect(calls.captured).toEqual([boom]);

    suite.revokeConsent();
    suite.errorReporter.captureException(new Error('after revoke'));

    expect(calls.close).toBe(1);
    expect(calls.captured).toEqual([boom]);
  });
});

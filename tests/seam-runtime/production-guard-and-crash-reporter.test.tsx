import { render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { appIdentity } from '@root/app.identity';
import { GuardedRootStack, resolveRootErrorReporter } from '@/app/_layout';
import type { RuntimePublicEnv } from '@/core/config/types';
import { AppRuntimeProvider, createAppRuntime } from '@/core/runtime';
import type { SentryClientLike } from '@/core/vendors/sentry-error-reporter';
import { appTranslationResources } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';

const mockProtectedGuards: { guard: boolean; screenNames: string[] }[] = [];

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactActual = require('react') as typeof React;
  const StackScreen = (_props: { name: string }) => null;
  const StackProtected = ({
    guard,
    children,
  }: {
    guard: boolean;
    redirectTo?: string;
    children?: React.ReactNode;
  }) => {
    const names: string[] = [];
    ReactActual.Children.forEach(children, (child) => {
      if (ReactActual.isValidElement<{ name?: string }>(child) && child.props.name) {
        names.push(child.props.name);
      }
    });
    mockProtectedGuards.push({ guard, screenNames: names });
    return null;
  };
  const Stack = ({ children }: { children?: React.ReactNode }) =>
    ReactActual.createElement(ReactActual.Fragment, null, children);
  Stack.Screen = StackScreen;
  Stack.Protected = StackProtected;
  return {
    Stack,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useSegments: () => ['(tabs)'],
  };
});

function createEnv(overrides: Partial<RuntimePublicEnv> = {}): RuntimePublicEnv {
  return {
    appVariant: 'development',
    appChannel: 'official',
    apiBaseUrl: 'https://api.acme.cn',
    privacyPolicyUrl: 'https://legal.acme.cn/privacy',
    userAgreementUrl: 'https://legal.acme.cn/terms',
    enableMockGateway: false,
    enableDevTools: false,
    ...overrides,
  };
}

describe('Route Shell production guard & Privacy-Gated crash reporter hook (Tickets 03 & 04)', () => {
  beforeEach(() => {
    mockProtectedGuards.length = 0;
  });

  it('blocks developer-lab route in production App Variant while allowing it in development', async () => {
    const prodRuntime = createTestRuntime({
      env: createEnv({ appVariant: 'production' }),
    });
    prodRuntime.privacyGateStore.getState().acceptPrivacyPolicy();
    await prodRuntime.authSessionStore.getState().establishSession({
      tokens: { accessToken: 'tok', refreshToken: 'ref' },
      user: { id: 'u-1', username: 'tester', displayName: 'Tester' },
    });

    render(
      <AppRuntimeProvider runtime={prodRuntime}>
        <GuardedRootStack />
      </AppRuntimeProvider>,
    );

    await waitFor(() => {
      const prodDevLabGroup = mockProtectedGuards.find((g) =>
        g.screenNames.includes('developer-lab'),
      );
      expect(prodDevLabGroup).toBeDefined();
      expect(prodDevLabGroup?.guard).toBe(false);
    });

    mockProtectedGuards.length = 0;

    const devRuntime = createTestRuntime({
      env: createEnv({ appVariant: 'development' }),
    });
    devRuntime.privacyGateStore.getState().acceptPrivacyPolicy();
    await devRuntime.authSessionStore.getState().establishSession({
      tokens: { accessToken: 'tok', refreshToken: 'ref' },
      user: { id: 'u-1', username: 'tester', displayName: 'Tester' },
    });

    render(
      <AppRuntimeProvider runtime={devRuntime}>
        <GuardedRootStack />
      </AppRuntimeProvider>,
    );

    await waitFor(() => {
      const devDevLabGroup = mockProtectedGuards.find((g) =>
        g.screenNames.includes('developer-lab'),
      );
      expect(devDevLabGroup).toBeDefined();
      expect(devDevLabGroup?.guard).toBe(true);
    });
  });

  it('wires env-driven ErrorReporter strictly behind Privacy Gate consent and closes on revocation', () => {
    const mockClient: jest.Mocked<SentryClientLike> = {
      init: jest.fn(),
      captureException: jest.fn(),
      close: jest.fn(),
    };

    // Unconfigured DSN returns undefined
    expect(
      resolveRootErrorReporter(createEnv({ sentryDsn: undefined }), mockClient),
    ).toBeUndefined();

    const envWithDsn = createEnv({
      appVariant: 'production',
      sentryDsn: 'https://public@sentry.acme.cn/1',
    });
    const errorReporter = resolveRootErrorReporter(envWithDsn, mockClient);
    expect(errorReporter).toBeDefined();

    const base = createTestRuntime();
    const runtime = createAppRuntime({
      identity: appIdentity,
      env: envWithDsn,
      translations: appTranslationResources,
      observability: { errorReporter },
      overrides: {
        keyValueStorage: base.keyValueStorage,
        secretStorage: base.secretStorage,
      },
    });

    // Before Privacy Gate consent: never initialized, errors not forwarded
    expect(mockClient.init).not.toHaveBeenCalled();
    runtime.errorReporter.captureException(new Error('pre-consent-error'));
    expect(mockClient.captureException).not.toHaveBeenCalled();

    // Grant privacy consent -> initializes with PII disabled & forwards errors
    runtime.privacyGateStore.getState().acceptPrivacyPolicy();
    expect(mockClient.init).toHaveBeenCalledTimes(1);
    expect(mockClient.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@sentry.acme.cn/1',
        environment: 'production',
        sendDefaultPii: false,
        tracesSampleRate: 0,
      }),
    );

    const boom = new Error('post-consent-error');
    runtime.errorReporter.captureException(boom, { screen: 'home' });
    expect(mockClient.captureException).toHaveBeenCalledWith(boom, { extra: { screen: 'home' } });

    // Revoke consent -> closes client and drops subsequent errors
    runtime.privacyGateStore.getState().resetPrivacyConsent();
    expect(mockClient.close).toHaveBeenCalledTimes(1);
    mockClient.captureException.mockClear();
    runtime.errorReporter.captureException(new Error('post-revoke-error'));
    expect(mockClient.captureException).not.toHaveBeenCalled();
  });
});

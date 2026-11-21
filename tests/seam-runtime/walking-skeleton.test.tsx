import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { parseRuntimePublicEnv } from '@/core/config/env-schema';
import { AppRuntimeProvider, resolveStartupRuntimeEnv } from '@/core/runtime';
import { HomeStarterScreen } from '@/features/home';
import { appTranslationResources, createDemoHttpTransport } from '@/shared';
import { createTestRuntime } from '../helpers/create-test-runtime';

describe('Seam 1: Walking skeleton startup screen & runtime env enforcement', () => {
  it('renders the active App Identity display name and App Variant badge from injected runtime', async () => {
    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        displayName: '星辰测试应用',
        compliance: {
          ...appIdentity.compliance,
          requirePrivacyConsent: false,
        },
      },
      env: {
        appVariant: 'staging',
        apiBaseUrl: 'https://api-staging.example.com',
        privacyPolicyUrl: 'https://legal.example.com/privacy',
        userAgreementUrl: 'https://legal.example.com/terms',
      },
      translations: appTranslationResources,
      overrides: {
        httpTransport: createDemoHttpTransport(),
      },
    });

    const mounted = await render(
      <AppRuntimeProvider runtime={runtime}>
        <HomeStarterScreen />
      </AppRuntimeProvider>,
    );

    expect(await screen.findByText('星辰测试应用')).toBeTruthy();
    expect(screen.getByText('STAGING')).toBeTruthy();
    expect(screen.getByText('https://api-staging.example.com')).toBeTruthy();
    expect(await screen.findByText('企业级移动端四层边界规范发布')).toBeTruthy();
    await mounted.unmount();
  });

  it('fails fast with explicit field diagnostics when startup runtime environment variables are missing', () => {
    expect(() => resolveStartupRuntimeEnv({})).toThrow(/APP_VARIANT/);
  });

  it('validates camelCase extra.runtimeEnv directly via parseRuntimePublicEnv and enforces HTTPS in production', () => {
    expect(() =>
      parseRuntimePublicEnv({
        appVariant: 'production',
        appChannel: 'official',
        apiBaseUrl: 'http://insecure.example.com',
        privacyPolicyUrl: 'https://legal.example.com/privacy',
        userAgreementUrl: 'https://legal.example.com/terms',
      }),
    ).toThrow(/https:\/\//);

    expect(() => parseRuntimePublicEnv(null)).toThrow(/UNKNOWN_ENV/);

    const validProd = parseRuntimePublicEnv({
      appVariant: 'production',
      appChannel: 'huawei',
      apiBaseUrl: 'https://api.example.com',
      privacyPolicyUrl: 'https://legal.example.com/privacy',
      userAgreementUrl: 'https://legal.example.com/terms',
      enableDemoGateway: true,
      enableDevTools: true,
    });
    expect(validProd.enableDemoGateway).toBe(false);
    expect(validProd.enableDevTools).toBe(false);
    expect(validProd.appChannel).toBe('huawei');

    const validStagingDefaults = parseRuntimePublicEnv({
      appVariant: 'staging',
      apiBaseUrl: 'https://api-staging.example.com',
      privacyPolicyUrl: 'https://legal.example.com/privacy',
      userAgreementUrl: 'https://legal.example.com/terms',
    });
    expect(validStagingDefaults.appChannel).toBe('official');
    expect(validStagingDefaults.enableDemoGateway).toBe(false);
    expect(validStagingDefaults.enableDevTools).toBe(true);
  });
});

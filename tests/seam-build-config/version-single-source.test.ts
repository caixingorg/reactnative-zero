import { PACKAGE_VERSION } from '@root/config/app-version';
import { resolveExpoConfig } from '@root/config/expo-config-resolver';
import { appIdentity } from '@root/app.identity';
import { parseDistributeCliArgs } from '@root/scripts/lib/distribute-core';
import packageJson from '@root/package.json';

const validBaseEnv = {
  EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com',
  EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.example.com/privacy',
  EXPO_PUBLIC_USER_AGREEMENT_URL: 'https://legal.example.com/terms',
  APP_VARIANT: 'staging',
};

describe('Seam: app version has a single source of truth', () => {
  it('uses the package.json version for both the Expo config and distribution when no env is set', () => {
    const expoConfig = resolveExpoConfig(appIdentity, validBaseEnv);
    const distribute = parseDistributeCliArgs([], {});

    expect(PACKAGE_VERSION).toBe(packageJson.version);
    expect(expoConfig.version).toBe(packageJson.version);
    expect(distribute.version).toBe(packageJson.version);
  });

  it('keeps the Expo config and distribution versions identical when APP_VERSION is overridden', () => {
    const env = { ...validBaseEnv, APP_VERSION: '2.5.1' };

    expect(resolveExpoConfig(appIdentity, env).version).toBe('2.5.1');
    expect(parseDistributeCliArgs([], env).version).toBe('2.5.1');
  });

  it('still lets an explicit distribution version win over the binary version', () => {
    const env = { ...validBaseEnv, APP_VERSION: '2.5.1', DISTRIBUTE_APP_VERSION: '9.9.9' };

    expect(parseDistributeCliArgs([], env).version).toBe('9.9.9');
  });

  it('derives build number and versionCode from the CI run number, and lets explicit env override it', () => {
    const ci = resolveExpoConfig(appIdentity, { ...validBaseEnv, GITHUB_RUN_NUMBER: '137' });
    expect(ci.ios?.buildNumber).toBe('137');
    expect(ci.android?.versionCode).toBe(137);

    const explicit = resolveExpoConfig(appIdentity, {
      ...validBaseEnv,
      GITHUB_RUN_NUMBER: '137',
      IOS_BUILD_NUMBER: '42',
      ANDROID_VERSION_CODE: '420',
    });
    expect(explicit.ios?.buildNumber).toBe('42');
    expect(explicit.android?.versionCode).toBe(420);
  });

  it('ignores an unparseable CI run number and falls back to 1', () => {
    const config = resolveExpoConfig(appIdentity, { ...validBaseEnv, GITHUB_RUN_NUMBER: 'abc' });

    expect(config.ios?.buildNumber).toBe('1');
    expect(config.android?.versionCode).toBe(1);
  });

  it('falls back to build number 1 and versionCode 1 locally, ignoring invalid values', () => {
    const local = resolveExpoConfig(appIdentity, {
      ...validBaseEnv,
      ANDROID_VERSION_CODE: 'not-a-number',
    });

    expect(local.ios?.buildNumber).toBe('1');
    expect(local.android?.versionCode).toBe(1);
  });
});

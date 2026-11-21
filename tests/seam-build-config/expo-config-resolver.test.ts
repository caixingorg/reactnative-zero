import { appIdentity } from '@root/app.identity';
import { resolveExpoConfig } from '@root/config/expo-config-resolver';
import {
  DEFAULT_ALIYUN_MAVEN_REPOS,
  DEFAULT_CHINA_COCOAPODS_MIRROR_URL,
  injectAndroidChinaMavenMirrors,
  injectIosPodfileChinaMirror,
  resolveShouldUseChinaMirrors,
} from '@root/config/with-china-build-mirrors';
import type { AppIdentity } from '@/core/config/types';

const fixtureIdentity: AppIdentity = {
  displayName: '企业底座',
  slug: 'enterprise-foundation',
  iosBundleIdentifier: 'com.acme.foundation',
  androidPackage: 'com.acme.foundation',
  scheme: 'acmefoundation',
  defaultLanguage: 'zh-CN',
  theme: {
    primaryLight: '#2563EB',
    primaryDark: '#60A5FA',
    radiusBase: 10,
    spacingUnit: 4,
  },
  privacyPolicyVersion: '2026.1',
  compliance: {
    requirePrivacyConsent: true,
    requirePermissionRationale: true,
  },
  capabilities: {
    camera: true,
    photoLibrary: true,
    mediaLibrary: true,
    filesAndSharing: true,
    webview: true,
    biometrics: true,
    location: true,
    notifications: true,
    audioVideo: true,
    backgroundAudio: false,
  },
};

const validBaseEnv = {
  EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com',
  EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.example.com/privacy',
  EXPO_PUBLIC_USER_AGREEMENT_URL: 'https://legal.example.com/terms',
};

describe('Seam 2: resolveExpoConfig multi-variant isolation, icon badges & env validation', () => {
  it('isolates bundle identifiers, schemes, display names, adaptive icon colors, and dev-client plugin across App Variants', () => {
    const devConfig = resolveExpoConfig(fixtureIdentity, {
      ...validBaseEnv,
      APP_VARIANT: 'development',
    });
    const stgConfig = resolveExpoConfig(fixtureIdentity, {
      ...validBaseEnv,
      APP_VARIANT: 'staging',
    });
    const prodConfig = resolveExpoConfig(fixtureIdentity, {
      ...validBaseEnv,
      APP_VARIANT: 'production',
    });

    expect(devConfig.name).toBe('企业底座 (Dev)');
    expect(devConfig.ios?.bundleIdentifier).toBe('com.acme.foundation.dev');
    expect(devConfig.android?.package).toBe('com.acme.foundation.dev');
    expect(devConfig.scheme).toBe('acmefoundation-dev');
    expect(devConfig.icon).toBe('./assets/icons/icon-dev.png');
    expect(devConfig.android?.adaptiveIcon?.backgroundColor).toBe('#0EA5E9');
    expect(devConfig.plugins).toContain('expo-dev-client');
    expect(devConfig.experiments?.typedRoutes).toBe(true);

    expect(stgConfig.name).toBe('企业底座 (Stg)');
    expect(stgConfig.ios?.bundleIdentifier).toBe('com.acme.foundation.stg');
    expect(stgConfig.android?.package).toBe('com.acme.foundation.stg');
    expect(stgConfig.scheme).toBe('acmefoundation-stg');
    expect(stgConfig.icon).toBe('./assets/icons/icon-stg.png');
    expect(stgConfig.android?.adaptiveIcon?.backgroundColor).toBe('#D97706');
    expect(stgConfig.plugins).toContain('expo-dev-client');

    expect(prodConfig.name).toBe('企业底座');
    expect(prodConfig.ios?.bundleIdentifier).toBe('com.acme.foundation');
    expect(prodConfig.android?.package).toBe('com.acme.foundation');
    expect(prodConfig.scheme).toBe('acmefoundation');
    expect(prodConfig.icon).toBe('./assets/icons/icon-prod.png');
    expect(prodConfig.android?.adaptiveIcon?.backgroundColor).toBe('#2563EB');
    expect(prodConfig.plugins).not.toContain('expo-dev-client');
  });

  it('rejects missing or malformed environment variables with explicit field diagnostics', () => {
    expect(() =>
      resolveExpoConfig(fixtureIdentity, {
        ...validBaseEnv,
        APP_VARIANT: 'qa-unknown',
      }),
    ).toThrow(/APP_VARIANT/);

    expect(() =>
      resolveExpoConfig(fixtureIdentity, {
        ...validBaseEnv,
        APP_VARIANT: 'development',
        EXPO_PUBLIC_API_BASE_URL: 'not-a-valid-http-url',
      }),
    ).toThrow(/EXPO_PUBLIC_API_BASE_URL/);

    expect(() =>
      resolveExpoConfig(fixtureIdentity, {
        APP_VARIANT: 'production',
      }),
    ).toThrow(/EXPO_PUBLIC_API_BASE_URL/);

    // 原因：生产变体强制要求 HTTPS，拒绝明文 http:// 接口地址
    expect(() =>
      resolveExpoConfig(fixtureIdentity, {
        ...validBaseEnv,
        APP_VARIANT: 'production',
        EXPO_PUBLIC_API_BASE_URL: 'http://insecure-api.example.com',
      }),
    ).toThrow(/https:\/\//);

    // 非生产本地联调允许 http://
    expect(
      resolveExpoConfig(fixtureIdentity, {
        ...validBaseEnv,
        APP_VARIANT: 'development',
        EXPO_PUBLIC_API_BASE_URL: 'http://127.0.0.1:8080',
      }).extra?.runtimeEnv?.apiBaseUrl,
    ).toBe('http://127.0.0.1:8080');
  });

  it('resolves a valid configuration from the repository default App Identity', () => {
    const config = resolveExpoConfig(appIdentity, {
      ...validBaseEnv,
      APP_VARIANT: 'development',
    });

    expect(config.slug).toBe(appIdentity.slug);
    expect(config.extra?.appVariant).toBe('development');
    expect(config.extra?.appChannel).toBe('official');
    expect(config.extra?.appIdentity).toEqual(appIdentity);
  });

  it('supports multi-channel APP_CHANNEL injection for domestic & overseas stores and rejects malformed channel strings', () => {
    const huaweiConfig = resolveExpoConfig(fixtureIdentity, {
      ...validBaseEnv,
      APP_VARIANT: 'production',
      APP_CHANNEL: 'huawei',
    });
    expect(huaweiConfig.extra?.appChannel).toBe('huawei');
    expect(huaweiConfig.extra?.runtimeEnv?.appChannel).toBe('huawei');

    expect(() =>
      resolveExpoConfig(fixtureIdentity, {
        ...validBaseEnv,
        APP_VARIANT: 'production',
        APP_CHANNEL: 'invalid channel with spaces!',
      }),
    ).toThrow(/APP_CHANNEL/);
  });

  it('switches China Gradle/CocoaPods build mirrors independently of privacy consent and enforces HTTPS-only CocoaPods mirror URLs', () => {
    // 开启隐私门禁但未显式开启 useChinaBuildMirrors 时，不得静默切走国内镜像（避免误伤海外 GDPR 应用）
    expect(resolveShouldUseChinaMirrors(fixtureIdentity, {})).toBe(false);

    const chinaMirrorsIdentity: AppIdentity = {
      ...fixtureIdentity,
      compliance: {
        ...fixtureIdentity.compliance,
        useChinaBuildMirrors: true,
      },
    };
    expect(resolveShouldUseChinaMirrors(chinaMirrorsIdentity, {})).toBe(true);
    expect(
      resolveShouldUseChinaMirrors(chinaMirrorsIdentity, {
        EXPO_USE_CHINA_MIRRORS: 'false',
      }),
    ).toBe(false);

    const overseasIdentity: AppIdentity = {
      ...fixtureIdentity,
      compliance: {
        requirePrivacyConsent: false,
        requirePermissionRationale: false,
      },
    };
    expect(resolveShouldUseChinaMirrors(overseasIdentity, {})).toBe(false);
    expect(
      resolveShouldUseChinaMirrors(overseasIdentity, {
        EXPO_USE_CHINA_MIRRORS: 'true',
      }),
    ).toBe(true);

    const sampleGradle = [
      'buildscript {',
      '    repositories {',
      '        google()',
      '        mavenCentral()',
      '    }',
      '}',
      'allprojects {',
      '    repositories {',
      '        google()',
      '        mavenCentral()',
      '    }',
      '}',
    ].join('\n');

    const injectedGradleOnce = injectAndroidChinaMavenMirrors(sampleGradle);
    const injectedGradleTwice = injectAndroidChinaMavenMirrors(injectedGradleOnce);
    expect(injectedGradleTwice).toBe(injectedGradleOnce);
    for (const repoUrl of DEFAULT_ALIYUN_MAVEN_REPOS) {
      expect(injectedGradleOnce).toContain(`maven { url '${repoUrl}' }`);
    }
    expect(injectedGradleOnce.indexOf(DEFAULT_ALIYUN_MAVEN_REPOS[0])).toBeLessThan(
      injectedGradleOnce.indexOf('google()'),
    );

    const samplePodfile = "platform :ios, '15.1'\ntarget 'App' do\nend\n";
    const injectedPodfileOnce = injectIosPodfileChinaMirror(samplePodfile);
    const injectedPodfileTwice = injectIosPodfileChinaMirror(injectedPodfileOnce);
    expect(injectedPodfileTwice).toBe(injectedPodfileOnce);
    expect(injectedPodfileOnce).toContain(`source '${DEFAULT_CHINA_COCOAPODS_MIRROR_URL}'`);
    expect(injectedPodfileOnce.indexOf(DEFAULT_CHINA_COCOAPODS_MIRROR_URL)).toBeLessThan(
      injectedPodfileOnce.indexOf("platform :ios, '15.1'"),
    );

    expect(() =>
      injectIosPodfileChinaMirror(samplePodfile, 'http://insecure-mirror.example.com/Specs.git'),
    ).toThrow(/only https:\/\//i);
    expect(() =>
      injectIosPodfileChinaMirror(samplePodfile, 'ftp://bad-mirror.example.com'),
    ).toThrow(/only https:\/\//i);
  });
});

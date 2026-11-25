/**
 * @module config/expo-config-resolver
 * 职责：纯函数化 Expo CNG 原生配置推导器——根据 `AppIdentity` 与强校验环境变量生成多变体包名、图标、Scheme 及按能力门控的插件列表。
 * 边界：`withCapabilityManifestSanitizer` 必须保持在 `plugins[0]`，利用 `withMod` LIFO 机制在所有插件之后做末端兜底清洗。
 */
import type { ExpoConfig } from 'expo/config';
import { parseRuntimeEnv } from '../src/core/config/env-schema';
import type { AppIdentity, AppVariant, CapabilityFlags } from '../src/core/config/types';
import { resolveAndroidVersionCode, resolveAppVersion, resolveIosBuildNumber } from './app-version';
import {
  CAPABILITY_USAGE_TEXTS,
  collectBlockedAndroidPermissions,
  isBackgroundAudioEnabled,
} from './capability-permission-matrix';
import { resolveShouldUseChinaMirrors } from './with-china-build-mirrors';

interface VariantMeta {
  idSuffix: string;
  nameSuffix: string;
  schemeSuffix: string;
  iconPath: string;
  iconAccentColor: string;
}

function getVariantMeta(identity: AppIdentity): Record<AppVariant, VariantMeta> {
  return {
    development: {
      idSuffix: '.dev',
      nameSuffix: ' (Dev)',
      schemeSuffix: '-dev',
      iconPath: './assets/icons/icon-dev.png',
      iconAccentColor: '#0EA5E9',
    },
    staging: {
      idSuffix: '.stg',
      nameSuffix: ' (Stg)',
      schemeSuffix: '-stg',
      iconPath: './assets/icons/icon-stg.png',
      iconAccentColor: '#D97706',
    },
    production: {
      idSuffix: '',
      nameSuffix: '',
      schemeSuffix: '',
      iconPath: './assets/icons/icon-prod.png',
      iconAccentColor: identity.theme.primaryLight,
    },
  };
}

interface ManifestPermissionsResult {
  infoPlist: Record<string, string | boolean>;
  androidPermissions: string[];
  androidBlockedPermissions: string[];
  capabilityPlugins: NonNullable<ExpoConfig['plugins']>;
}

// 原因：遵循 ADR-0005，对关闭的能力同样显式注册插件并传 false，阻止 @expo/prebuild-config 自动套用 legacy 默认英文权限文案
function resolveCapabilityManifestPermissions(
  capabilities: CapabilityFlags,
  appVariant: AppVariant,
): ManifestPermissionsResult {
  if (capabilities.backgroundAudio === true && !capabilities.audioVideo) {
    throw new Error(
      'Invalid AppIdentity capabilities: "backgroundAudio: true" requires "audioVideo: true" in app.identity.ts.',
    );
  }

  const infoPlist: Record<string, string | boolean> = {};
  const androidPermissions = new Set<string>();
  const capabilityPlugins: NonNullable<ExpoConfig['plugins']> = [];

  if (capabilities.camera) {
    infoPlist.NSCameraUsageDescription = CAPABILITY_USAGE_TEXTS.camera;
    androidPermissions.add('android.permission.CAMERA');
  }
  capabilityPlugins.push([
    'expo-camera',
    {
      cameraPermission: capabilities.camera ? CAPABILITY_USAGE_TEXTS.camera : false,
      microphonePermission: capabilities.audioVideo ? CAPABILITY_USAGE_TEXTS.microphone : false,
      recordAudioAndroid: capabilities.audioVideo,
      barcodeScannerEnabled: capabilities.camera,
    },
  ]);

  if (capabilities.photoLibrary) {
    infoPlist.NSPhotoLibraryUsageDescription = CAPABILITY_USAGE_TEXTS.photoLibrary;
  }
  // 原因：microphonePermission 必须与 capabilities.audioVideo 对齐，否则 expo-image-picker 会将 RECORD_AUDIO 加入 blockedPermissions
  capabilityPlugins.push([
    'expo-image-picker',
    {
      photosPermission: capabilities.photoLibrary ? CAPABILITY_USAGE_TEXTS.photoLibrary : false,
      cameraPermission: capabilities.camera ? CAPABILITY_USAGE_TEXTS.camera : false,
      microphonePermission: capabilities.audioVideo ? CAPABILITY_USAGE_TEXTS.microphone : false,
    },
  ]);

  if (capabilities.mediaLibrary) {
    infoPlist.NSPhotoLibraryAddUsageDescription = CAPABILITY_USAGE_TEXTS.mediaSave;
    androidPermissions.add('android.permission.WRITE_EXTERNAL_STORAGE');
  }
  capabilityPlugins.push([
    'expo-media-library',
    {
      photosPermission: capabilities.photoLibrary ? CAPABILITY_USAGE_TEXTS.photoLibrary : false,
      savePhotosPermission: capabilities.mediaLibrary ? CAPABILITY_USAGE_TEXTS.mediaSave : false,
      isAccessMediaLocationEnabled: false,
      granularPermissions: [],
    },
  ]);

  if (capabilities.location) {
    infoPlist.NSLocationWhenInUseUsageDescription = CAPABILITY_USAGE_TEXTS.location;
    androidPermissions.add('android.permission.ACCESS_FINE_LOCATION');
    androidPermissions.add('android.permission.ACCESS_COARSE_LOCATION');
  }
  capabilityPlugins.push([
    'expo-location',
    {
      locationWhenInUsePermission: capabilities.location ? CAPABILITY_USAGE_TEXTS.location : false,
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
      motionUsagePermission: false,
      locationFullAccuracyPermission: false,
      isIosBackgroundLocationEnabled: false,
      isAndroidBackgroundLocationEnabled: false,
      isAndroidForegroundServiceEnabled: false,
      isAndroidMotionActivityEnabled: false,
    },
  ]);

  if (capabilities.audioVideo) {
    infoPlist.NSMicrophoneUsageDescription = CAPABILITY_USAGE_TEXTS.microphone;
    androidPermissions.add('android.permission.RECORD_AUDIO');
    capabilityPlugins.push('expo-video');
  }
  capabilityPlugins.push([
    'expo-audio',
    {
      microphonePermission: capabilities.audioVideo ? CAPABILITY_USAGE_TEXTS.microphone : false,
      recordAudioAndroid: capabilities.audioVideo,
      // 原因：后台播放由独立的 backgroundAudio 开关控制（默认关闭），清单清洗插件读取同一开关，单点开启即可
      enableBackgroundPlayback: isBackgroundAudioEnabled(capabilities),
      enableBackgroundRecording: false,
    },
  ]);

  if (capabilities.biometrics) {
    infoPlist.NSFaceIDUsageDescription = CAPABILITY_USAGE_TEXTS.faceId;
    androidPermissions.add('android.permission.USE_BIOMETRIC');
  }
  capabilityPlugins.push([
    'expo-local-authentication',
    {
      faceIDPermission: capabilities.biometrics ? CAPABILITY_USAGE_TEXTS.faceId : false,
    },
  ]);

  if (capabilities.notifications) {
    androidPermissions.add('android.permission.POST_NOTIFICATIONS');
    capabilityPlugins.push('expo-notifications');
  }

  return {
    infoPlist,
    androidPermissions: Array.from(androidPermissions),
    androidBlockedPermissions: Array.from(
      collectBlockedAndroidPermissions(capabilities, appVariant),
    ),
    capabilityPlugins,
  };
}

const DEFAULT_TEMPLATE_SLUG = 'enterprise-rn-template';

function isPlaceholderExampleDomain(urlValue: string): boolean {
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    return hostname === 'example.com' || hostname.endsWith('.example.com');
  } catch {
    return false;
  }
}

// 原因：生产变体在已派生应用（slug 已改）或正式发版（CI_RELEASE / STRICT_PRODUCTION_ENV）下严禁携带 example.com 占位域名；模板仓库默认 CI 冒烟则保持通行
export function assertNoProductionPlaceholderDomains(
  identity: AppIdentity,
  runtimeEnv: ReturnType<typeof parseRuntimeEnv>,
  rawEnv: Record<string, string | undefined>,
): void {
  if (runtimeEnv.appVariant !== 'production') {
    return;
  }
  const isDerivedApp = identity.slug !== DEFAULT_TEMPLATE_SLUG;
  const isStrictRelease = rawEnv.CI_RELEASE === 'true' || rawEnv.STRICT_PRODUCTION_ENV === 'true';
  if (!isDerivedApp && !isStrictRelease) {
    return;
  }

  const checkedFields: readonly [string, string][] = [
    ['EXPO_PUBLIC_API_BASE_URL', runtimeEnv.apiBaseUrl],
    ['EXPO_PUBLIC_PRIVACY_POLICY_URL', runtimeEnv.privacyPolicyUrl],
    ['EXPO_PUBLIC_USER_AGREEMENT_URL', runtimeEnv.userAgreementUrl],
  ];
  const invalidFields = checkedFields
    .filter(([, url]) => isPlaceholderExampleDomain(url))
    .map(([field, url]) => `${field}=${url}`);

  if (invalidFields.length > 0) {
    throw new Error(
      `Production build blocked: placeholder example.com domain(s) detected [${invalidFields.join(', ')}]. Configure real production URLs in config/env/production.env before releasing.`,
    );
  }
}

// 原因：纯函数化原生配置推导（Seam 2），支持通过单测秒级验证多变体包名、自适应图标底色区分与最终编译态敏感权限剥离
export function resolveExpoConfig(
  identity: AppIdentity,
  rawEnv: Record<string, string | undefined>,
): ExpoConfig {
  const runtimeEnv = parseRuntimeEnv(rawEnv);
  assertNoProductionPlaceholderDomains(identity, runtimeEnv, rawEnv);
  const variant = getVariantMeta(identity)[runtimeEnv.appVariant];
  const manifestPermissions = resolveCapabilityManifestPermissions(
    identity.capabilities,
    runtimeEnv.appVariant,
  );
  const appChannel = runtimeEnv.appChannel ?? 'official';
  const useChinaBuildMirrors = resolveShouldUseChinaMirrors(identity, rawEnv);

  // 原因：withCapabilityManifestSanitizer 必须置于 plugins[0]，利用 withMod 逆序包裹机制在全部插件执行完毕后做末端清理
  const plugins: NonNullable<ExpoConfig['plugins']> = [
    [
      './config/with-capability-manifest-sanitizer',
      {
        capabilities: identity.capabilities,
        appVariant: runtimeEnv.appVariant,
        appChannel,
        requirePrivacyConsent: identity.compliance.requirePrivacyConsent,
        blockedAndroidAutoInitProviders: identity.compliance.blockedAndroidAutoInitProviders,
      },
    ],
    [
      './config/with-china-build-mirrors',
      {
        enabled: useChinaBuildMirrors,
        cocoapodsMirrorUrl: rawEnv.EXPO_COCOAPODS_MIRROR_URL,
      },
    ],
    // 原因：Expo 模板的 release 构建默认使用公开的 debug 密钥签名；production 变体必须改用环境变量注入的 release 密钥
    ['./config/with-android-release-signing', { required: runtimeEnv.appVariant === 'production' }],
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    ...manifestPermissions.capabilityPlugins,
  ];

  if (runtimeEnv.appVariant !== 'production') {
    plugins.push('expo-dev-client');
  }

  const appVersion = resolveAppVersion(rawEnv);
  const iosBuildNumber = resolveIosBuildNumber(rawEnv);
  const androidVersionCode = resolveAndroidVersionCode(rawEnv);

  return {
    name: `${identity.displayName}${variant.nameSuffix}`,
    slug: identity.slug,
    version: appVersion,
    orientation: 'portrait',
    icon: variant.iconPath,
    scheme: `${identity.scheme}${variant.schemeSuffix}`,
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: false,
      bundleIdentifier: `${identity.iosBundleIdentifier}${variant.idSuffix}`,
      buildNumber: iosBuildNumber,
      infoPlist: manifestPermissions.infoPlist,
    },
    android: {
      package: `${identity.androidPackage}${variant.idSuffix}`,
      versionCode: androidVersionCode,
      adaptiveIcon: {
        foregroundImage: variant.iconPath,
        backgroundColor: variant.iconAccentColor,
      },
      permissions: manifestPermissions.androidPermissions,
      blockedPermissions: manifestPermissions.androidBlockedPermissions,
    },
    plugins,
    experiments: {
      typedRoutes: true,
    },
    extra: {
      appVariant: runtimeEnv.appVariant,
      appChannel,
      useChinaBuildMirrors,
      variantAccentColor: variant.iconAccentColor,
      appIdentity: identity,
      runtimeEnv,
    },
  };
}

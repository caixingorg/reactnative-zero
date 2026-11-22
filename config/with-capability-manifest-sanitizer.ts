/**
 * @module config/with-capability-manifest-sanitizer
 * 职责：Expo Config Plugin 末端原生清单清洗器——剔除未启用能力的 iOS/Android 权限、阻断高风险后台/前台定位服务、关闭生产明文 HTTP、注入渠道号并拦截第三方 SDK 自动初始化 ContentProvider。
 * 边界：依赖 `@expo/config-plugins` 的逆序（LIFO）执行模型，必须注册在 `plugins[0]` 才能覆盖第三方插件注入的默认声明。
 */
import {
  withAndroidManifest,
  withEntitlementsPlist,
  withInfoPlist,
  type ConfigPlugin,
} from 'expo/config-plugins';
import type { AppVariant, CapabilityFlags } from '../src/core/config/types';
import {
  collectBlockedAndroidPermissions,
  isBackgroundAudioEnabled,
} from './capability-permission-matrix';

export interface CapabilityManifestSanitizerProps {
  capabilities: CapabilityFlags;
  appVariant: AppVariant;
  appChannel?: string;
  requirePrivacyConsent?: boolean;
  blockedAndroidAutoInitProviders?: string[];
}

const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';

const UNUSED_LOCATION_FGS_SERVICES = [
  'expo.modules.location.services.LocationTaskService',
  'expo.modules.location.next.locationForegroundService.LocationForegroundService',
] as const;

// 原因：国内应用市场机审严禁在用户点击同意隐私政策前通过 ContentProvider.onCreate 自动初始化第三方 SDK 并读取 OAID/AndroidID
export const DEFAULT_PRIVACY_BLOCKED_ANDROID_PROVIDERS = [
  'com.google.firebase.provider.FirebaseInitProvider',
  'cn.jpush.android.service.DataProvider',
  'io.sentry.android.core.SentryInitProvider',
  'com.umeng.commonsdk.internal.UMInternalManagerAgent',
] as const;

export { isBackgroundAudioEnabled } from './capability-permission-matrix';

// 原因：@expo/config-plugins 的 withMod 为逆序（LIFO）包裹执行，本插件须挂载于 plugins[0]，从而在所有 legacy 自动插件运行后最终兜底清洗原生清单
export const withCapabilityManifestSanitizer: ConfigPlugin<CapabilityManifestSanitizerProps> = (
  initialConfig,
  {
    capabilities,
    appVariant,
    appChannel = 'official',
    requirePrivacyConsent = true,
    blockedAndroidAutoInitProviders = [],
  },
) => {
  let config = withInfoPlist(initialConfig, (modConfig) => {
    const plist = modConfig.modResults;

    // 始终剥离底座未使用的后台定位、运动传感器与临时精确定位字典
    delete plist.NSLocationAlwaysUsageDescription;
    delete plist.NSLocationAlwaysAndWhenInUseUsageDescription;
    delete plist.NSMotionUsageDescription;
    delete plist.NSLocationTemporaryUsageDescriptionDictionary;

    if (!capabilities.camera) {
      delete plist.NSCameraUsageDescription;
    }
    if (!capabilities.photoLibrary) {
      delete plist.NSPhotoLibraryUsageDescription;
    }
    if (!capabilities.mediaLibrary) {
      delete plist.NSPhotoLibraryAddUsageDescription;
    }
    if (!capabilities.location) {
      delete plist.NSLocationWhenInUseUsageDescription;
    }
    if (!capabilities.audioVideo) {
      delete plist.NSMicrophoneUsageDescription;
    }
    // 原因：未开启 backgroundAudio 时剥离 audio 后台模式，避免声明未使用的后台能力被 Apple 审核 2.5.4 拒审
    if (!isBackgroundAudioEnabled(capabilities) && Array.isArray(plist.UIBackgroundModes)) {
      const filteredModes = plist.UIBackgroundModes.filter((mode) => mode !== 'audio');
      if (filteredModes.length > 0) {
        plist.UIBackgroundModes = filteredModes;
      } else {
        delete plist.UIBackgroundModes;
      }
    }
    if (!capabilities.biometrics) {
      delete plist.NSFaceIDUsageDescription;
    }

    if (appVariant === 'production') {
      delete plist.NSLocalNetworkUsageDescription;
      delete plist.NSBonjourServices;
      // 原因：生产变体严禁任意明文 HTTP 例外，确保 iOS App Transport Security 保持严格模式
      if (
        plist.NSAppTransportSecurity &&
        typeof plist.NSAppTransportSecurity === 'object' &&
        !Array.isArray(plist.NSAppTransportSecurity)
      ) {
        const ats = plist.NSAppTransportSecurity as Record<string, unknown>;
        delete ats.NSAllowsArbitraryLoads;
        delete ats.NSAllowsArbitraryLoadsInWebContent;
      }
    }

    return modConfig;
  });

  config = withAndroidManifest(config, (modConfig) => {
    const manifestRoot = modConfig.modResults.manifest;
    manifestRoot.$ = manifestRoot.$ ?? {
      'xmlns:android': 'http://schemas.android.com/apk/res/android',
    };
    manifestRoot.$['xmlns:tools'] = TOOLS_NAMESPACE;

    const blockedSet = collectBlockedAndroidPermissions(capabilities, appVariant);
    const existingEntries = manifestRoot['uses-permission'] ?? [];

    // 保留非阻断权限，并清除启用权限上可能被交叉插件误标的 tools:node="remove"
    const retainedEntries = existingEntries.filter((entry) => {
      const permName = entry.$?.['android:name'];
      if (!permName) {
        return false;
      }
      if (blockedSet.has(permName)) {
        return false;
      }
      if (entry.$['tools:node'] === 'remove') {
        delete entry.$['tools:node'];
      }
      return true;
    });

    for (const blockedPerm of blockedSet) {
      retainedEntries.push({
        $: {
          'android:name': blockedPerm,
          'tools:node': 'remove',
        },
      });
    }

    manifestRoot['uses-permission'] = retainedEntries;

    if (manifestRoot['uses-permission-sdk-23']) {
      manifestRoot['uses-permission-sdk-23'] = manifestRoot['uses-permission-sdk-23'].filter(
        (entry) => {
          const permName = entry.$?.['android:name'];
          return Boolean(permName) && !blockedSet.has(permName);
        },
      );
    }

    const mainApp = manifestRoot.application?.[0];
    if (mainApp) {
      if (appVariant === 'production') {
        mainApp.$ = mainApp.$ ?? ({} as typeof mainApp.$);
        // 原因：生产变体强制关闭 Android 明文 HTTP 流量，阻断应用内任意组件走非加密通道
        mainApp.$['android:usesCleartextTraffic'] = 'false';
      }

      if (!capabilities.photoLibrary && !capabilities.mediaLibrary && mainApp.$) {
        delete mainApp.$['android:requestLegacyExternalStorage'];
      }

      // 原因：expo-location 库级 AndroidManifest 无条件声明了两个 foregroundServiceType="location" 的后台服务；显式注入 tools:node="remove" 防止 Gradle 合并后触发 Google Play 前台定位服务拒审
      const blockedServiceSet = new Set<string>(UNUSED_LOCATION_FGS_SERVICES);
      const retainedServices = (mainApp.service ?? []).filter((serviceEntry) => {
        const serviceName = serviceEntry.$?.['android:name'];
        return Boolean(serviceName) && !blockedServiceSet.has(serviceName);
      });
      for (const removedService of UNUSED_LOCATION_FGS_SERVICES) {
        retainedServices.push({
          $: {
            'android:name': removedService,
            'tools:node': 'remove',
          },
        });
      }
      mainApp.service = retainedServices;

      // 原因：将分发渠道号幂等写入 AndroidManifest meta-data（同时兼容通用 APP_CHANNEL 与国内友盟/统计常见 UMENG_CHANNEL 键名）
      const resolvedChannel = appChannel.trim() || 'official';
      const channelMetaKeys = new Set(['APP_CHANNEL', 'UMENG_CHANNEL']);
      const retainedMetaData = (mainApp['meta-data'] ?? []).filter((metaEntry) => {
        const metaName = metaEntry.$?.['android:name'];
        return Boolean(metaName) && !channelMetaKeys.has(metaName);
      });
      for (const metaKey of channelMetaKeys) {
        retainedMetaData.push({
          $: {
            'android:name': metaKey,
            'android:value': resolvedChannel,
          },
        });
      }
      mainApp['meta-data'] = retainedMetaData;

      // 原因：遵循 ADR-0004，拦截第三方 SDK 通过 ContentProvider.onCreate 在用户同意隐私政策前抢跑初始化
      const blockedProviders = new Set<string>(
        requirePrivacyConsent ? DEFAULT_PRIVACY_BLOCKED_ANDROID_PROVIDERS : [],
      );
      for (const customProvider of blockedAndroidAutoInitProviders) {
        const trimmed = customProvider.trim();
        if (trimmed) {
          blockedProviders.add(trimmed);
        }
      }
      if (blockedProviders.size > 0) {
        const existingProviders = (
          mainApp as {
            provider?: { $: Record<string, string> }[];
          }
        ).provider;
        const retainedProviders = (existingProviders ?? []).filter((providerEntry) => {
          const providerName = providerEntry.$?.['android:name'];
          return (
            typeof providerName === 'string' &&
            providerName.length > 0 &&
            !blockedProviders.has(providerName)
          );
        });
        for (const removedProvider of blockedProviders) {
          retainedProviders.push({
            $: {
              'android:name': removedProvider,
              'tools:node': 'remove',
            },
          });
        }
        (
          mainApp as {
            provider?: { $: Record<string, string> }[];
          }
        ).provider = retainedProviders;
      }
    }

    return modConfig;
  });

  // 原因：Expo SDK 58 自动加载 node_modules 中的 expo-notifications 插件并注入 aps-environment；关闭 notifications 时必须从 Entitlements 抹除
  config = withEntitlementsPlist(config, (modConfig) => {
    if (!capabilities.notifications) {
      delete modConfig.modResults['aps-environment'];
    }
    return modConfig;
  });

  return config;
};

export default withCapabilityManifestSanitizer;

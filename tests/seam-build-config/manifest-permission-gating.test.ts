import path from 'node:path';
import { compileModsAsync, withPlugins } from '@expo/config-plugins';
import { appIdentity } from '@root/app.identity';
import { resolveExpoConfig } from '@root/config/expo-config-resolver';
import { collectBlockedAndroidPermissions } from '@root/config/capability-permission-matrix';
import { DEFAULT_PRIVACY_BLOCKED_ANDROID_PROVIDERS } from '@root/config/with-capability-manifest-sanitizer';
import type { AppVariant, CapabilityFlags, ComplianceFlags } from '@/core/config/types';

const { getAutolinkedPackagesAsync } =
  require('@expo/prebuild-config/build/getAutolinkedPackages') as {
    getAutolinkedPackagesAsync: (
      projectRoot: string,
      platforms: ('ios' | 'android')[],
    ) => Promise<string[]>;
  };
const {
  withAndroidExpoPlugins,
  withIosExpoPlugins,
  withLegacyExpoPlugins,
  withVersionedExpoSDKPlugins,
} = require('@expo/prebuild-config/build/plugins/withDefaultPlugins') as {
  withVersionedExpoSDKPlugins: (cfg: Record<string, unknown>) => Record<string, unknown>;
  withLegacyExpoPlugins: (cfg: Record<string, unknown>) => Record<string, unknown>;
  withIosExpoPlugins: (
    cfg: Record<string, unknown>,
    props: { bundleIdentifier: string },
  ) => Record<string, unknown>;
  withAndroidExpoPlugins: (
    cfg: Record<string, unknown>,
    props: { package: string; projectRoot: string },
  ) => Record<string, unknown>;
};

const REPO_ROOT = path.resolve(__dirname, '../..');

interface AndroidUsesPermissionNode {
  $: {
    'android:name': string;
    'tools:node'?: string;
  };
}

interface AndroidServiceNode {
  $: {
    'android:name': string;
    'tools:node'?: string;
  };
}

interface AndroidMetaDataNode {
  $: {
    'android:name': string;
    'android:value'?: string;
  };
}

interface AndroidProviderNode {
  $: {
    'android:name': string;
    'tools:node'?: string;
  };
}

interface CompiledPrebuildSnapshot {
  infoPlist: Record<string, unknown>;
  androidUsesPermissions: AndroidUsesPermissionNode[];
  androidServices: AndroidServiceNode[];
  androidMetaData: AndroidMetaDataNode[];
  androidProviders: AndroidProviderNode[];
}

let cachedAutolinkedModules: string[] | null = null;

// 原因：完整复刻 expo prebuild 的真实插件链（含 autolinking 与 legacy 自动插件）并编译内存态 Info.plist 与 AndroidManifest，彻底消除只测插件前静态对象的盲区
async function compilePrebuildManifests(
  overrides: Partial<CapabilityFlags>,
  variant: AppVariant = 'production',
  options?: {
    appChannel?: string;
    compliance?: Partial<ComplianceFlags>;
  },
): Promise<CompiledPrebuildSnapshot> {
  if (!cachedAutolinkedModules) {
    cachedAutolinkedModules = await getAutolinkedPackagesAsync(REPO_ROOT, ['ios', 'android']);
  }

  const baseConfig = resolveExpoConfig(
    {
      ...appIdentity,
      compliance: {
        ...appIdentity.compliance,
        ...(options?.compliance ?? {}),
      },
      capabilities: {
        ...appIdentity.capabilities,
        ...overrides,
      },
    },
    {
      APP_VARIANT: variant,
      APP_CHANNEL: options?.appChannel,
      EXPO_PUBLIC_API_BASE_URL: 'https://api.acme.cn',
      EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.acme.cn/privacy',
      EXPO_PUBLIC_USER_AGREEMENT_URL: 'https://legal.acme.cn/terms',
    },
  );

  let modded: Record<string, unknown> = {
    ...baseConfig,
    _internal: {
      projectRoot: REPO_ROOT,
      autolinkedModules: cachedAutolinkedModules,
    },
  };

  modded = withPlugins(
    modded as never,
    (baseConfig.plugins ?? []) as Parameters<typeof withPlugins>[1],
  ) as unknown as Record<string, unknown>;
  modded = withVersionedExpoSDKPlugins(modded);
  modded = withLegacyExpoPlugins(modded);
  modded = withIosExpoPlugins(modded, {
    bundleIdentifier: baseConfig.ios?.bundleIdentifier ?? 'com.enterprise.rntemplate',
  });
  modded = withAndroidExpoPlugins(modded, {
    package: baseConfig.android?.package ?? 'com.enterprise.rntemplate',
    projectRoot: REPO_ROOT,
  });

  const compiled = (await compileModsAsync(modded as never, {
    projectRoot: REPO_ROOT,
    platforms: ['ios', 'android'],
    introspect: true,
  })) as unknown as {
    _internal: {
      modResults: {
        ios: { infoPlist: Record<string, unknown> };
        android: {
          manifest: {
            manifest: {
              'uses-permission'?: AndroidUsesPermissionNode[];
              application?: {
                service?: AndroidServiceNode[];
                'meta-data'?: AndroidMetaDataNode[];
                provider?: AndroidProviderNode[];
              }[];
            };
          };
        };
      };
    };
  };

  const mainApp = compiled._internal.modResults.android.manifest.manifest.application?.[0];

  return {
    infoPlist: compiled._internal.modResults.ios.infoPlist,
    androidUsesPermissions:
      compiled._internal.modResults.android.manifest.manifest['uses-permission'] ?? [],
    androidServices: mainApp?.service ?? [],
    androidMetaData: mainApp?.['meta-data'] ?? [],
    androidProviders: mainApp?.provider ?? [],
  };
}

function getActiveAndroidPermissions(snapshot: CompiledPrebuildSnapshot): string[] {
  return snapshot.androidUsesPermissions
    .filter((item) => item.$['tools:node'] !== 'remove')
    .map((item) => item.$['android:name']);
}

function getRemovedAndroidPermissions(snapshot: CompiledPrebuildSnapshot): string[] {
  return snapshot.androidUsesPermissions
    .filter((item) => item.$['tools:node'] === 'remove')
    .map((item) => item.$['android:name']);
}

describe('Seam 2: Compiled prebuild Info.plist & AndroidManifest permission gating (ADR-0005)', () => {
  it('retains all 6 required capabilities in compiled manifests when enabled, without RECORD_AUDIO conflict, Always-Location creep, or production DevLauncher residue', async () => {
    const compiled = await compilePrebuildManifests({}, 'production');

    expect(compiled.infoPlist.NSCameraUsageDescription).toBeDefined();
    expect(compiled.infoPlist.NSPhotoLibraryUsageDescription).toBeDefined();
    expect(compiled.infoPlist.NSPhotoLibraryAddUsageDescription).toBeDefined();
    expect(compiled.infoPlist.NSLocationWhenInUseUsageDescription).toBeDefined();
    expect(compiled.infoPlist.NSMicrophoneUsageDescription).toBeDefined();
    expect(compiled.infoPlist.NSFaceIDUsageDescription).toBeDefined();

    // Zero over-broad or dev-launcher residue in production Info.plist
    expect(compiled.infoPlist.NSLocationAlwaysUsageDescription).toBeUndefined();
    expect(compiled.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription).toBeUndefined();
    expect(compiled.infoPlist.NSMotionUsageDescription).toBeUndefined();
    expect(compiled.infoPlist.NSLocalNetworkUsageDescription).toBeUndefined();
    expect(compiled.infoPlist.NSBonjourServices).toBeUndefined();

    const activeAndroid = getActiveAndroidPermissions(compiled);
    const removedAndroid = getRemovedAndroidPermissions(compiled);

    expect(activeAndroid).toEqual(
      expect.arrayContaining([
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.USE_BIOMETRIC',
        'android.permission.POST_NOTIFICATIONS',
      ]),
    );
    expect(removedAndroid).not.toContain('android.permission.RECORD_AUDIO');
    // N5：系统 Photo Picker 免权限，能力全开也不得声明 Google Play 受限的照片权限
    // N4：底座无后台播放代码，能力全开也不得声明媒体播放前台服务或 iOS audio 后台模式
    for (const restricted of [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ]) {
      expect(activeAndroid).not.toContain(restricted);
      expect(removedAndroid).toContain(restricted);
    }
    const removedServiceNames = compiled.androidServices
      .filter((s) => s.$['tools:node'] === 'remove')
      .map((s) => s.$['android:name']);
    expect(removedServiceNames).toEqual(
      expect.arrayContaining([
        'expo.modules.location.services.LocationTaskService',
        'expo.modules.location.next.locationForegroundService.LocationForegroundService',
      ]),
    );
    expect(compiled.infoPlist.UIBackgroundModes).toBeUndefined();
    expect(removedAndroid).toEqual(
      expect.arrayContaining([
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ]),
    );
  });

  it.each([
    {
      flag: 'camera' as const,
      iosKey: 'NSCameraUsageDescription',
      androidPerm: 'android.permission.CAMERA',
    },
    {
      flag: 'audioVideo' as const,
      iosKey: 'NSMicrophoneUsageDescription',
      androidPerm: 'android.permission.RECORD_AUDIO',
    },
    {
      flag: 'photoLibrary' as const,
      iosKey: 'NSPhotoLibraryUsageDescription',
      androidPerm: 'android.permission.READ_EXTERNAL_STORAGE',
    },
    {
      flag: 'mediaLibrary' as const,
      iosKey: 'NSPhotoLibraryAddUsageDescription',
      androidPerm: 'android.permission.WRITE_EXTERNAL_STORAGE',
    },
    {
      flag: 'location' as const,
      iosKey: 'NSLocationWhenInUseUsageDescription',
      androidPerm: 'android.permission.ACCESS_FINE_LOCATION',
    },
    {
      flag: 'biometrics' as const,
      iosKey: 'NSFaceIDUsageDescription',
      androidPerm: 'android.permission.USE_BIOMETRIC',
    },
    {
      flag: 'notifications' as const,
      iosKey: null,
      androidPerm: 'android.permission.POST_NOTIFICATIONS',
    },
  ])(
    'strips $iosKey and marks $androidPerm tools:node="remove" in compiled prebuild output when $flag alone is disabled',
    async ({ flag, iosKey, androidPerm }) => {
      const compiled = await compilePrebuildManifests({ [flag]: false }, 'production');
      if (iosKey) {
        expect(compiled.infoPlist[iosKey]).toBeUndefined();
      }
      if (androidPerm) {
        expect(getActiveAndroidPermissions(compiled)).not.toContain(androidPerm);
        expect(getRemovedAndroidPermissions(compiled)).toContain(androidPerm);
      }
    },
  );

  it('declares background audio (iOS audio mode + Android media playback foreground service) only when backgroundAudio and audioVideo are both enabled', async () => {
    const enabled = await compilePrebuildManifests(
      { audioVideo: true, backgroundAudio: true, location: false },
      'production',
    );
    expect(enabled.infoPlist.UIBackgroundModes).toEqual(expect.arrayContaining(['audio']));
    expect(getActiveAndroidPermissions(enabled)).toEqual(
      expect.arrayContaining([
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      ]),
    );
    expect(getActiveAndroidPermissions(enabled)).not.toContain(
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    );

    expect(() =>
      resolveExpoConfig(
        {
          ...appIdentity,
          capabilities: {
            ...appIdentity.capabilities,
            audioVideo: false,
            backgroundAudio: true,
          },
        },
        {
          APP_VARIANT: 'production',
          EXPO_PUBLIC_API_BASE_URL: 'https://api.acme.cn',
          EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.acme.cn/privacy',
          EXPO_PUBLIC_USER_AGREEMENT_URL: 'https://legal.acme.cn/terms',
        },
      ),
    ).toThrow(/"backgroundAudio: true" requires "audioVideo: true"/);
  });

  it('produces a zero-sensitive-permission Info.plist & AndroidManifest when all capabilities are disabled in production', async () => {
    const allDisabled: CapabilityFlags = {
      camera: false,
      photoLibrary: false,
      mediaLibrary: false,
      filesAndSharing: false,
      webview: false,
      biometrics: false,
      location: false,
      notifications: false,
      audioVideo: false,
      backgroundAudio: false,
    };
    const compiled = await compilePrebuildManifests(allDisabled, 'production');

    const nsKeys = Object.keys(compiled.infoPlist).filter((key) => key.startsWith('NS'));
    expect(nsKeys.sort()).toEqual(['NSAppTransportSecurity', 'NSUserActivityTypes']);

    expect(getActiveAndroidPermissions(compiled).sort()).toEqual([
      'android.permission.INTERNET',
      'android.permission.VIBRATE',
    ]);
    expect(getRemovedAndroidPermissions(compiled)).toEqual(
      expect.arrayContaining([
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ]),
    );
  });

  it('injects APP_CHANNEL & UMENG_CHANNEL meta-data and strips auto-init ContentProviders when requirePrivacyConsent is enabled', async () => {
    const domesticCompiled = await compilePrebuildManifests({}, 'production', {
      appChannel: 'xiaomi',
      compliance: {
        requirePrivacyConsent: true,
        blockedAndroidAutoInitProviders: ['com.custom.sdk.AutoInitProvider'],
      },
    });

    const metaMap = new Map(
      domesticCompiled.androidMetaData.map((entry) => [
        entry.$['android:name'],
        entry.$['android:value'],
      ]),
    );
    expect(metaMap.get('APP_CHANNEL')).toBe('xiaomi');
    expect(metaMap.get('UMENG_CHANNEL')).toBe('xiaomi');

    const removedProviders = domesticCompiled.androidProviders
      .filter((p) => p.$['tools:node'] === 'remove')
      .map((p) => p.$['android:name']);
    expect(removedProviders).toEqual(
      expect.arrayContaining([
        ...DEFAULT_PRIVACY_BLOCKED_ANDROID_PROVIDERS,
        'com.custom.sdk.AutoInitProvider',
      ]),
    );

    const overseasCompiled = await compilePrebuildManifests({}, 'production', {
      appChannel: 'google_play',
      compliance: {
        requirePrivacyConsent: false,
      },
    });
    const overseasMetaMap = new Map(
      overseasCompiled.androidMetaData.map((entry) => [
        entry.$['android:name'],
        entry.$['android:value'],
      ]),
    );
    expect(overseasMetaMap.get('APP_CHANNEL')).toBe('google_play');
    const overseasRemovedProviders = overseasCompiled.androidProviders
      .filter((p) => p.$['tools:node'] === 'remove')
      .map((p) => p.$['android:name']);
    expect(overseasRemovedProviders).toEqual([]);
  });

  it('keeps resolveExpoConfig android.blockedPermissions 100% identical to collectBlockedAndroidPermissions and preserves plugins[0] sanitizer position', () => {
    const capabilityCases: CapabilityFlags[] = [
      appIdentity.capabilities,
      { ...appIdentity.capabilities, audioVideo: true, backgroundAudio: true },
      {
        camera: false,
        photoLibrary: false,
        mediaLibrary: false,
        filesAndSharing: false,
        webview: false,
        biometrics: false,
        location: false,
        notifications: false,
        audioVideo: false,
        backgroundAudio: false,
      },
    ];

    for (const variant of ['development', 'staging', 'production'] as const) {
      for (const capabilities of capabilityCases) {
        const config = resolveExpoConfig(
          { ...appIdentity, capabilities },
          {
            APP_VARIANT: variant,
            EXPO_PUBLIC_API_BASE_URL: 'https://api.acme.cn',
            EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.acme.cn/privacy',
            EXPO_PUBLIC_USER_AGREEMENT_URL: 'https://legal.acme.cn/terms',
          },
        );

        const expectedBlocked = Array.from(
          collectBlockedAndroidPermissions(capabilities, variant),
        ).sort();
        expect([...(config.android?.blockedPermissions ?? [])].sort()).toEqual(expectedBlocked);
        expect(config.plugins?.[0]).toEqual([
          './config/with-capability-manifest-sanitizer',
          expect.objectContaining({
            capabilities,
            appVariant: variant,
          }),
        ]);
      }
    }
  });

  it('adds zero extra Info.plist keys or Android permissions when mediaCompression is enabled vs disabled', async () => {
    const baseFlags: CapabilityFlags = {
      camera: false,
      photoLibrary: false,
      mediaLibrary: false,
      filesAndSharing: false,
      webview: false,
      biometrics: false,
      location: false,
      notifications: false,
      audioVideo: false,
      backgroundAudio: false,
    };

    const disabledCompiled = await compilePrebuildManifests(
      { ...baseFlags, mediaCompression: false },
      'production',
    );
    const enabledCompiled = await compilePrebuildManifests(
      { ...baseFlags, mediaCompression: true },
      'production',
    );

    expect(Object.keys(enabledCompiled.infoPlist).sort()).toEqual(
      Object.keys(disabledCompiled.infoPlist).sort(),
    );
    expect(getActiveAndroidPermissions(enabledCompiled).sort()).toEqual(
      getActiveAndroidPermissions(disabledCompiled).sort(),
    );
    expect(getRemovedAndroidPermissions(enabledCompiled).sort()).toEqual(
      getRemovedAndroidPermissions(disabledCompiled).sort(),
    );
  });
});

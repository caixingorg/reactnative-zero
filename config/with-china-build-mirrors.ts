/**
 * @module config/with-china-build-mirrors
 * 职责：可选的国内构建镜像注入插件——在 `android/build.gradle` 幂等前置阿里云 Maven 源、在 `ios/Podfile` 顶部注入清华 CocoaPods 源。
 * 边界：由 `identity.compliance.useChinaBuildMirrors` 或 `EXPO_USE_CHINA_MIRRORS` 显式控制，独立于隐私合规开关；镜像 URL 强制 `https://`。
 */
import { withPodfile, withProjectBuildGradle, type ConfigPlugin } from 'expo/config-plugins';
import type { AppIdentity } from '../src/core/config/types';

export interface ChinaBuildMirrorsPluginProps {
  enabled: boolean;
  cocoapodsMirrorUrl?: string;
}

export const DEFAULT_ALIYUN_MAVEN_REPOS = [
  'https://maven.aliyun.com/repository/public',
  'https://maven.aliyun.com/repository/google',
  'https://maven.aliyun.com/repository/gradle-plugin',
] as const;

export const DEFAULT_CHINA_COCOAPODS_MIRROR_URL =
  'https://mirrors.tuna.tsinghua.edu.cn/git/CocoaPods/Specs.git';

const GRADLE_MIRROR_BEGIN_MARKER = '// @enterprise-rn-china-mirrors-begin';
const GRADLE_MIRROR_END_MARKER = '// @enterprise-rn-china-mirrors-end';
const PODFILE_MIRROR_BEGIN_MARKER = '# @enterprise-rn-china-mirrors-begin';
const PODFILE_MIRROR_END_MARKER = '# @enterprise-rn-china-mirrors-end';

// 原因：构建镜像源属于网络基础设施开关，必须独立于隐私合规开关显式声明，避免海外 GDPR 应用因开启隐私门禁被静默路由至国内镜像
export function resolveShouldUseChinaMirrors(
  identity: AppIdentity,
  rawEnv: Record<string, string | undefined>,
): boolean {
  if (rawEnv.EXPO_USE_CHINA_MIRRORS === 'true') {
    return true;
  }
  if (rawEnv.EXPO_USE_CHINA_MIRRORS === 'false') {
    return false;
  }
  return identity.compliance.useChinaBuildMirrors === true;
}

// 原因：在 android/build.gradle 的 repositories 块头部幂等前置阿里云 Maven 镜像群，保留官方源作兜底以兼顾拉取速度与冷门包完整性
export function injectAndroidChinaMavenMirrors(buildGradleContents: string): string {
  if (buildGradleContents.includes(GRADLE_MIRROR_BEGIN_MARKER)) {
    return buildGradleContents;
  }

  const mirrorBlockLines = [
    `        ${GRADLE_MIRROR_BEGIN_MARKER}`,
    ...DEFAULT_ALIYUN_MAVEN_REPOS.map((url) => `        maven { url '${url}' }`),
    `        ${GRADLE_MIRROR_END_MARKER}`,
  ].join('\n');

  return buildGradleContents.replace(
    /repositories\s*\{/g,
    (match) => `${match}\n${mirrorBlockLines}`,
  );
}

function sanitizeCocoapodsMirrorUrl(rawUrl: string | undefined): string {
  const candidate = (rawUrl?.trim() || DEFAULT_CHINA_COCOAPODS_MIRROR_URL).trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Invalid CocoaPods mirror URL "${candidate}": must be a valid HTTP/HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid CocoaPods mirror URL "${candidate}": only https:// is permitted to prevent build MITM.`,
    );
  }
  if (candidate.includes("'") || candidate.includes('\n') || candidate.includes('\r')) {
    throw new Error(`Invalid CocoaPods mirror URL "${candidate}": contains unsafe characters.`);
  }
  return candidate;
}

// 原因：在 ios/Podfile 顶部幂等声明国内 CocoaPods Specs 镜像源，防止新员工首次 pod install 卡死在 GitHub 官方 Specs 仓库
export function injectIosPodfileChinaMirror(
  podfileContents: string,
  cocoapodsMirrorUrl?: string,
): string {
  if (podfileContents.includes(PODFILE_MIRROR_BEGIN_MARKER)) {
    return podfileContents;
  }

  const safeUrl = sanitizeCocoapodsMirrorUrl(cocoapodsMirrorUrl);
  const headerBlock = [
    PODFILE_MIRROR_BEGIN_MARKER,
    `source '${safeUrl}'`,
    PODFILE_MIRROR_END_MARKER,
    '',
  ].join('\n');

  return `${headerBlock}${podfileContents}`;
}

export const withChinaBuildMirrors: ConfigPlugin<ChinaBuildMirrorsPluginProps> = (
  initialConfig,
  { enabled, cocoapodsMirrorUrl },
) => {
  if (!enabled) {
    return initialConfig;
  }

  let config = withProjectBuildGradle(initialConfig, (modConfig) => {
    if (modConfig.modResults.language === 'groovy') {
      modConfig.modResults.contents = injectAndroidChinaMavenMirrors(modConfig.modResults.contents);
    }
    return modConfig;
  });

  config = withPodfile(config, (modConfig) => {
    modConfig.modResults.contents = injectIosPodfileChinaMirror(
      modConfig.modResults.contents,
      cocoapodsMirrorUrl,
    );
    return modConfig;
  });

  return config;
};

export default withChinaBuildMirrors;

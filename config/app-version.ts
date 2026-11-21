import packageJson from '../package.json';

type VersionEnv = Readonly<Record<string, string | undefined>>;

// 原因：版本号以 package.json 为唯一来源，Expo 配置解析器与分发脚本共用本模块，避免二者各写一份默认值而产生漂移
export const PACKAGE_VERSION: string = packageJson.version;

function parsePositiveInt(raw: string | undefined): number | null {
  const parsed = Number.parseInt(raw?.trim() ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// 原因：CI 的流水线序号天然单调递增，用作 build number 的缺省来源；本地构建仍可用显式环境变量覆盖
function resolveCiBuildSequence(env: VersionEnv): number | null {
  return parsePositiveInt(env.GITHUB_RUN_NUMBER) ?? parsePositiveInt(env.CI_PIPELINE_IID);
}

export function resolveAppVersion(env: VersionEnv): string {
  return env.APP_VERSION?.trim() || PACKAGE_VERSION;
}

export function resolveIosBuildNumber(env: VersionEnv): string {
  const explicit = env.IOS_BUILD_NUMBER?.trim();
  if (explicit) {
    return explicit;
  }
  return String(resolveCiBuildSequence(env) ?? 1);
}

export function resolveAndroidVersionCode(env: VersionEnv): number {
  return parsePositiveInt(env.ANDROID_VERSION_CODE) ?? resolveCiBuildSequence(env) ?? 1;
}

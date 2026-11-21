// 原因：发布标签到变体、版本号与 build number 的映射是纯逻辑，单独成模块便于测试；
// 版本码只由标签推导，不依赖 CI 运行序号（workflow 重建会重新计数）或 git 提交数（浅克隆与压缩历史都会让它回退）
export interface ReleaseMeta {
  tag: string;
  version: string;
  variant: 'production' | 'staging';
  versionCode: number;
}

const TAG_PATTERN = /^v(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:-rc\.(\d{1,2}))?$/;

// 原因：正式版槽位固定为 99，高于任何 rc（1-98），保证同一版本号下正式包永远能覆盖 rc 包
const FINAL_SLOT = 99;
const MAX_RC = 98;
// 原因：Android versionCode 上限为 2,100,000,000，主版本超过 20 会溢出
const MAX_MAJOR = 20;

export function parseReleaseTag(tag: string, packageVersion: string): ReleaseMeta {
  const match = TAG_PATTERN.exec(tag);
  if (!match) {
    throw new Error(
      `Unsupported release tag '${tag}'. Use vX.Y.Z for production or vX.Y.Z-rc.N for staging.`,
    );
  }
  const [major, minor, patch] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  if (major > MAX_MAJOR) {
    throw new Error(`Major version must not exceed ${MAX_MAJOR} (Android versionCode limit).`);
  }
  const rc = match[4] === undefined ? undefined : Number(match[4]);
  if (rc !== undefined && (rc < 1 || rc > MAX_RC)) {
    throw new Error(`Release candidate number must be between 1 and ${MAX_RC}.`);
  }

  const version = `${major}.${minor}.${patch}`;
  // 原因：包内版本来自 package.json，标签与它不一致会产出「标签说 1.2.0、包里是 1.1.0」的包
  if (version !== packageVersion) {
    throw new Error(
      `Tag ${tag} does not match package.json version ${packageVersion}. Bump the version first.`,
    );
  }

  return {
    tag,
    version,
    variant: rc === undefined ? 'production' : 'staging',
    versionCode: ((major * 1000 + minor) * 1000 + patch) * 100 + (rc ?? FINAL_SLOT),
  };
}

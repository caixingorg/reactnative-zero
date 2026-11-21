// 原因：体积比较是纯逻辑，单独成模块便于测试；阈值按百分比，基线随有意的体积变化显式更新
export interface BundleSizeBaseline {
  androidHermesBytes: number;
  thresholdPercent: number;
}

export interface BundleSizeResult {
  ok: boolean;
  actualBytes: number;
  baselineBytes: number;
  deltaBytes: number;
  deltaPercent: number;
  limitBytes: number;
}

export function parseBaseline(raw: unknown): BundleSizeBaseline {
  const candidate = raw as Partial<BundleSizeBaseline> | null;
  const bytes = candidate?.androidHermesBytes;
  const percent = candidate?.thresholdPercent;
  if (
    typeof bytes !== 'number' ||
    !Number.isInteger(bytes) ||
    bytes <= 0 ||
    typeof percent !== 'number' ||
    !(percent > 0 && percent <= 100)
  ) {
    throw new Error(
      'Invalid bundle size baseline: expected a positive integer androidHermesBytes and thresholdPercent in (0, 100].',
    );
  }
  return { androidHermesBytes: bytes, thresholdPercent: percent };
}

export function compareBundleSize(
  actualBytes: number,
  baseline: BundleSizeBaseline,
): BundleSizeResult {
  const limitBytes = Math.floor(
    baseline.androidHermesBytes * (1 + baseline.thresholdPercent / 100),
  );
  const deltaBytes = actualBytes - baseline.androidHermesBytes;
  return {
    ok: actualBytes <= limitBytes,
    actualBytes,
    baselineBytes: baseline.androidHermesBytes,
    deltaBytes,
    deltaPercent: Number(((deltaBytes / baseline.androidHermesBytes) * 100).toFixed(2)),
    limitBytes,
  };
}

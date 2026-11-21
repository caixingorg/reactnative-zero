// 原因：在内核与初始化脚本间复用统一的 HTTP/HTTPS 地址归一化校验，阻断换行符注入、伪协议与尾部斜杠拼接污染
export function normalizeHttpBaseUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl || /[\r\n]/.test(rawUrl)) {
    return null;
  }
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

import { PACKAGE_VERSION } from '../config/app-version';
import { parseReleaseTag } from './lib/release-core';

// 原因：输出 KEY=VALUE 行，workflow 直接追加到 $GITHUB_OUTPUT；解析失败时以非零码退出，阻止后续出包
const tag = process.argv[2] ?? '';
try {
  const meta = parseReleaseTag(tag, PACKAGE_VERSION);
  process.stdout.write(
    `variant=${meta.variant}\nversion=${meta.version}\nversion_code=${meta.versionCode}\n`,
  );
} catch (err: unknown) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

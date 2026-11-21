import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compareBundleSize, parseBaseline } from './lib/bundle-size-core';

// 用法：pnpm check:bundle-size <expo export 输出目录> [--update]
// 原因：只测量 Android Hermes 字节码（实际下发给用户的体积）；--update 在体积变化有意为之时刷新基线
const root = resolve(__dirname, '..');
const baselinePath = join(root, 'config', 'bundle-size-baseline.json');
const exportDir = process.argv[2];
const update = process.argv.includes('--update');

if (!exportDir) {
  process.stderr.write('Usage: check-bundle-size <expo export output dir> [--update]\n');
  process.exit(2);
}

const jsDir = join(resolve(exportDir), '_expo', 'static', 'js', 'android');
const bundles = existsSync(jsDir) ? readdirSync(jsDir).filter((name) => name.endsWith('.hbc')) : [];
if (bundles.length !== 1 || !bundles[0]) {
  process.stderr.write(
    `Expected exactly one Hermes bundle in ${jsDir}, found ${bundles.length}.\n`,
  );
  process.exit(2);
}
const actualBytes = statSync(join(jsDir, bundles[0])).size;

if (update) {
  const current = parseBaseline(JSON.parse(readFileSync(baselinePath, 'utf8')));
  const next = { ...current, androidHermesBytes: actualBytes };
  writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(`基线已更新为 ${actualBytes} 字节。\n`);
  process.exit(0);
}

const baseline = parseBaseline(JSON.parse(readFileSync(baselinePath, 'utf8')));
const result = compareBundleSize(actualBytes, baseline);
const summary = `Android Hermes 字节码 ${result.actualBytes} 字节，基线 ${result.baselineBytes}，变化 ${result.deltaBytes >= 0 ? '+' : ''}${result.deltaBytes}（${result.deltaPercent}%），上限 ${result.limitBytes}。`;
if (result.ok) {
  process.stdout.write(`体积检查通过：${summary}\n`);
} else {
  process.stderr.write(
    `体积检查失败：${summary}\n若增长有意为之，运行 pnpm check:bundle-size <目录> --update 刷新基线并在 PR 中说明原因。\n`,
  );
  process.exit(1);
}

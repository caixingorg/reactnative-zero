import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderChangelog } from './lib/changelog-core';

// 原因：只读取 <上一个 v* 标签>..<目标> 范围内的提交主题；绝不使用 --all，避免带入本地备份引用里的历史
function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const to = argValue('--to') ?? 'HEAD';
const out = argValue('--out');

// 原因：正式版的说明要覆盖自上一个正式版以来的全部变更，因此排除 rc 标签；rc 版本才以上一个标签（含 rc）为起点
const isReleaseCandidate = /-rc\.\d+$/.test(to);
const describeArgs = ['describe', '--tags', '--abbrev=0', '--match', 'v*'];
if (!isReleaseCandidate) {
  describeArgs.push('--exclude', '*-rc.*');
}
let previousTag: string | undefined;
try {
  previousTag = git([...describeArgs, `${to}^`]) || undefined;
} catch {
  previousTag = undefined;
}

const range = previousTag ? `${previousTag}..${to}` : to;
const subjects = git(['log', range, '--no-merges', '--format=%s'])
  .split('\n')
  .filter((subject) => subject.length > 0);

const heading = to === 'HEAD' ? '未发布' : to;
const markdown = renderChangelog(heading, subjects);

if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, markdown);
} else {
  process.stdout.write(markdown);
}

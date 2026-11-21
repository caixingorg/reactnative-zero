import os from 'node:os';
import path from 'node:path';
import { runEnvPreflight } from './lib/env-preflight';

// 原因：在 prebuild / 原生编译 / 克隆初始化之前提前拦截已知环境坑，用可读提示替代几分钟后才出现的晦涩原生报错
const projectRoot = path.resolve(__dirname, '..');
const issues = runEnvPreflight({
  projectRoot,
  networkInterfaces: os.networkInterfaces(),
  env: process.env,
});

for (const issue of issues) {
  const prefix = issue.level === 'error' ? '✖ [preflight] 错误' : '⚠ [preflight] 提示';
  const log = issue.level === 'error' ? console.error : console.warn;
  log(`${prefix}：${issue.message}\n`);
}

if (issues.some((issue) => issue.level === 'error')) {
  process.exit(1);
}

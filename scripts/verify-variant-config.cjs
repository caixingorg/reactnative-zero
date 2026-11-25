#!/usr/bin/env node
/* global __dirname */
// 原因：回归守卫 N3——release 构建时 expo-constants 以 mode=production 调用 @expo/env 再 getConfig，
// 若项目根存在 .env.production 等文件会污染 staging 等变体的 extra.runtimeEnv。
// 本脚本在干净子进程中复现“mode × variant”组合，断言 runtimeEnv 只来自 config/env/<variant>.env。
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const strictProduction = process.argv.includes('--strict-production');
const variants = ['development', 'staging', 'production'];
const modes = ['development', 'production'];
const forbiddenRootEnvFiles = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
];

const failures = [];

for (const file of forbiddenRootEnvFiles) {
  if (fs.existsSync(path.join(projectRoot, file))) {
    failures.push(
      `根目录存在 ${file}：@expo/env 会按 NODE_ENV 自动加载它并覆盖变体配置，请移入 config/env/`,
    );
  }
}

function parseEnvFile(filePath) {
  const result = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) {
      result[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return result;
}

const childScript = `
const env = require('@expo/env');
process.env = env.getOriginalEnv();
env.loadProjectEnv(process.cwd(), { mode: process.argv[1], silent: true });
const { getConfig } = require('expo/config');
const { exp } = getConfig(process.cwd(), { isPublicConfig: true, skipSDKVersionRequirement: true });
process.stdout.write(JSON.stringify(exp.extra && exp.extra.runtimeEnv));
`;

function cleanChildEnv(variant) {
  const childEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === 'NODE_ENV' || key.startsWith('JEST_') || key.startsWith('EXPO_PUBLIC_')) {
      continue;
    }
    if (key === 'APP_VARIANT' || key === 'STRICT_PRODUCTION_ENV' || key === 'CI_RELEASE') {
      continue;
    }
    childEnv[key] = value;
  }
  childEnv.APP_VARIANT = variant;
  if (strictProduction && variant === 'production') {
    childEnv.STRICT_PRODUCTION_ENV = 'true';
  }
  return childEnv;
}

for (const variant of variants) {
  const expected = parseEnvFile(path.join(projectRoot, 'config', 'env', `${variant}.env`));
  for (const mode of modes) {
    const label = `variant=${variant} mode=${mode}`;
    const child = spawnSync(process.execPath, ['-e', childScript, mode], {
      cwd: projectRoot,
      env: cleanChildEnv(variant),
      encoding: 'utf8',
    });
    if (child.status !== 0) {
      failures.push(`${label}: 子进程失败\n${child.stderr}`);
      continue;
    }
    let runtimeEnv;
    try {
      runtimeEnv = JSON.parse(child.stdout);
    } catch {
      failures.push(`${label}: 无法解析输出 ${child.stdout}`);
      continue;
    }
    const checks = [
      ['appVariant', variant],
      ['apiBaseUrl', expected.EXPO_PUBLIC_API_BASE_URL],
      [
        'enableDevTools',
        variant !== 'production' && expected.EXPO_PUBLIC_ENABLE_DEVTOOLS !== 'false',
      ],
      [
        'enableMockGateway',
        variant !== 'production' && expected.EXPO_PUBLIC_ENABLE_MOCK_GATEWAY === 'true',
      ],
    ];
    const failuresBefore = failures.length;
    for (const [key, want] of checks) {
      const got = runtimeEnv ? runtimeEnv[key] : undefined;
      if (got !== want) {
        failures.push(
          `${label}: runtimeEnv.${key} 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`,
        );
      }
    }
    if (failures.length === failuresBefore) {
      console.log(`✓ ${label} → ${runtimeEnv.apiBaseUrl}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`变体配置回归检查失败：\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('变体配置回归检查通过');

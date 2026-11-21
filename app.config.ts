import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import type { AppIdentity } from './src/core/config/types';

// 原因：@expo/require-utils 仅单文件转译 app.config.ts 本身，必须先注册 tsx/cjs 同步钩子再 require 本地 .ts 配置模块
require('tsx/cjs');

const { appIdentity } = require('./app.identity') as { appIdentity: AppIdentity };
const { resolveExpoConfig } = require('./config/expo-config-resolver') as {
  resolveExpoConfig: (
    identity: AppIdentity,
    rawEnv: Record<string, string | undefined>,
  ) => ExpoConfig;
};

// 原因：变体 env 放在 config/env/<variant>.env，Expo CLI 只会按 NODE_ENV 自动加载根目录 .env.<mode>，release 构建（mode=production）不会把 production 值串入 staging；命令行显式传入的环境变量仍优先覆盖
function loadVariantEnvFile(variant: string): Record<string, string> {
  const envFilePath = path.resolve(__dirname, 'config', 'env', `${variant}.env`);
  if (!fs.existsSync(envFilePath)) {
    return {};
  }

  const content = fs.readFileSync(envFilePath, 'utf8');
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    parsed[key] = value;
  }

  return parsed;
}

export default (_context: ConfigContext): ExpoConfig => {
  const activeVariant = process.env.APP_VARIANT ?? 'development';
  if (!['development', 'staging', 'production'].includes(activeVariant)) {
    throw new Error(
      `未知的 APP_VARIANT: ${activeVariant}（仅支持 development、staging、production）`,
    );
  }
  const variantFileEnv = loadVariantEnvFile(activeVariant);

  const mergedEnv: Record<string, string | undefined> = {
    ...variantFileEnv,
    ...process.env,
    APP_VARIANT: activeVariant,
  };

  return resolveExpoConfig(appIdentity, mergedEnv);
};

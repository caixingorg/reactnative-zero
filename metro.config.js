const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
const upstreamResolveRequest = config.resolver.resolveRequest;

const PRODUCTION_MODULE_REPLACEMENTS = new Map([
  [
    path.resolve(projectRoot, 'src/core/devtools/DevToolsOverlay.tsx'),
    path.resolve(projectRoot, 'src/core/devtools/DevToolsOverlay.prod.tsx'),
  ],
  [
    path.resolve(projectRoot, 'src/core/devtools/devtools-store.ts'),
    path.resolve(projectRoot, 'src/core/devtools/devtools-store.prod.ts'),
  ],
  [
    path.resolve(projectRoot, 'src/shared/mock/mock-http-transport.ts'),
    path.resolve(projectRoot, 'src/shared/mock/mock-http-transport.prod.ts'),
  ],
  [
    path.resolve(projectRoot, 'src/features/payment/checkout-sandbox.ts'),
    path.resolve(projectRoot, 'src/features/payment/checkout-sandbox.prod.ts'),
  ],
  [
    path.resolve(projectRoot, 'src/features/auth/demo-credentials.ts'),
    path.resolve(projectRoot, 'src/features/auth/demo-credentials.prod.ts'),
  ],
]);

// 原因：将 APP_VARIANT 纳入 Metro 缓存版本键，防止跨变体（如 staging 切 production）打包时命中旧的模块解析缓存
config.cacheVersion = `variant-${process.env.APP_VARIANT ?? 'development'}`;

// 原因：按显式 APP_VARIANT（与 app.config.ts 同源，不依赖 NODE_ENV）在打包阶段将非生产调试抽屉与演示网关替换为空桩，既保留 staging release 包的联调能力，又从 production 包物理剔除调试代码
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);

  if (
    process.env.APP_VARIANT === 'production' &&
    resolution.type === 'sourceFile' &&
    PRODUCTION_MODULE_REPLACEMENTS.has(resolution.filePath)
  ) {
    const replacementPath = PRODUCTION_MODULE_REPLACEMENTS.get(resolution.filePath);
    if (!replacementPath || !fs.existsSync(replacementPath)) {
      throw new Error(
        `Missing production stub file for "${resolution.filePath}": expected "${replacementPath}". Refusing to bundle non-production module into production build.`,
      );
    }
    return {
      type: 'sourceFile',
      filePath: replacementPath,
    };
  }

  return resolution;
};

module.exports = config;

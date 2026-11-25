// 原因：Expo Router 与 Reanimated v4 需要通过 babel-preset-expo 统一编译，避免手动重复挂载 worklets 插件
module.exports = function (api) {
  // 原因：缓存键必须包含变体，否则切换 APP_VARIANT 后 Babel 会复用上一变体的转译结果，导致 console 去除状态串扰
  const isProduction = api.cache.using(() => process.env.APP_VARIANT === 'production');

  return {
    presets: ['babel-preset-expo'],
    // 原因：仅 production 变体在编译期移除 console；保留 error/warn 以便原生崩溃与告警仍可被系统日志采集，
    // 业务诊断走 observability 的环形日志，不受影响
    plugins: isProduction
      ? [[require.resolve('./config/babel-plugin-strip-console'), { exclude: ['error', 'warn'] }]]
      : [],
  };
};

// 原因：Expo Router 与 Reanimated v4 需要通过 babel-preset-expo 统一编译，避免手动重复挂载 worklets 插件
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};

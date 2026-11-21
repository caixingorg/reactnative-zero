/** @type {import('jest').Config} */
// 原因：在保留 jest-expo 默认转译白名单及 Reanimated 排除项的基础上，补充转译 nitro-core ESM 模块以兼容 MMKV v4
module.exports = {
  preset: 'jest-expo',
  setupFiles: [
    '<rootDir>/node_modules/@shopify/flash-list/jestSetup.js',
    '<rootDir>/tests/helpers/jest-setup.js',
  ],
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@root/(.*)$': '<rootDir>/$1',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|nitro-core|@shopify/flash-list|react-native-keyboard-controller))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  clearMocks: true,
  // 原因：覆盖率范围限定为应用源码；演示页与能力实验室仅作模板展示（可由 init-app --clean-starter 清除），
  // *.prod.* 是仅在 production 打包时替换进来的桩文件，测试环境按设计不加载
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.prod.{ts,tsx}',
    '!src/features/capabilities-lab/**',
    '!src/shared/demo/**',
  ],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // 原因：阈值取向下取整后只升不降。排除演示页等文件后实测为语句 75.56 / 分支 66.89 / 函数 74.15 / 行 75.04，
  // 行覆盖率仅高出阈值 0.04 个百分点，余量很小；是否放宽由维护者决定
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 65,
      functions: 73,
      lines: 75,
    },
  },
};

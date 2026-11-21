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
};

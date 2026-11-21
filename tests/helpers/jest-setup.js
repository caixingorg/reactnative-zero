/* global jest */
// 原因：react-native-keyboard-controller 依赖原生 TurboModule，在 Jest Node 环境下统一挂载官方 mock
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);

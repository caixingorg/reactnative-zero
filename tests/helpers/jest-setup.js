/* global jest */
// 原因：react-native-keyboard-controller 依赖原生 TurboModule，在 Jest Node 环境下统一挂载官方 mock
// 原因：Reanimated / Worklets 官方 mock 在 4.x 里仍会触发真实原生初始化并报错，所以只手写本项目用到的几个函数：
// 共享值退化成普通对象，动画直接取终值，回到 JS 线程的调用立即执行。
// 手势的真实拖动手感无法在 Jest 验证，只测纯函数和点击路径，拖动在真机上验证
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
}));
jest.mock('react-native-reanimated', () => {
  const { ScrollView, View } = require('react-native');
  return {
    __esModule: true,
    default: { ScrollView, View, createAnimatedComponent: (component) => component },
    isSharedValue: (value) => typeof value === 'object' && value !== null && 'value' in value,
    useSharedValue: (initial) => {
      const shared = {
        value: initial,
        get: () => shared.value,
        set: (next) => {
          shared.value = next;
        },
      };
      return shared;
    },
    useAnimatedScrollHandler: (handlers) => (event) => {
      const nativeEvent = event?.nativeEvent ?? event;
      if (typeof handlers === 'function') {
        handlers(nativeEvent);
      } else {
        handlers?.onScroll?.(nativeEvent);
      }
    },
    useAnimatedStyle: (factory) => factory(),
    withTiming: (target) => target,
    interpolate: (value, input, output) => {
      const ratio = (value - input[0]) / (input[1] - input[0]);
      return output[0] + (output[1] - output[0]) * ratio;
    },
  };
});
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);

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
// 原因：react-native-pager-view 依赖原生 RNCViewPager 视图与 TurboModule Commands，在 Jest Node 环境下挂载最小受控桩；
// 原型方法保持无副作用（不触发内部 setState，也不回放 onPageSelected），避免 TopTabs 点击联动时产生 act 警告或重复触发 onIndexChange。
jest.mock('react-native-pager-view', () => {
  const React = require('react');
  const { View } = require('react-native');

  class MockPagerView extends React.Component {
    setPage() {}

    setPageWithoutAnimation() {}

    setScrollEnabled() {}

    render() {
      const { children, initialPage = 0, scrollEnabled = true, ...rest } = this.props;
      return React.createElement(
        View,
        {
          ...rest,
          initialPage,
          scrollEnabled,
        },
        children,
      );
    }
  }

  return {
    __esModule: true,
    default: MockPagerView,
  };
});
// 原因：@gorhom/bottom-sheet 内部深度耦合 Reanimated UI worklet 与Portal宿主测算，在 Jest Node 环境下提供确定性受控桩，
// 完整保留 present/dismiss 命令式句柄、backdropComponent 渲染与 onDismiss 回调契约
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  const BottomSheetModalProvider = ({ children }) =>
    React.createElement(View, { testID: 'bottom-sheet-modal-provider' }, children);

  const BottomSheetView = ({ children, style, ...rest }) =>
    React.createElement(View, { style, ...rest }, children);

  const BottomSheetBackdrop = (props) =>
    React.createElement(View, { testID: 'gorhom-bottom-sheet-backdrop', ...props });

  const BottomSheetModal = React.forwardRef(function MockBottomSheetModal(props, ref) {
    const { children, backdropComponent, onDismiss, ...rest } = props;
    React.useImperativeHandle(ref, () => ({
      present: () => {},
      dismiss: () => {
        onDismiss?.();
      },
      close: () => {
        onDismiss?.();
      },
      snapToIndex: () => {},
      expand: () => {},
      collapse: () => {},
    }));

    const backdrop =
      typeof backdropComponent === 'function'
        ? backdropComponent({ animatedIndex: { value: 0 }, animatedPosition: { value: 0 } })
        : null;

    return React.createElement(
      View,
      { testID: 'gorhom-bottom-sheet-modal', ...rest },
      backdrop,
      children,
    );
  });

  return {
    __esModule: true,
    default: BottomSheetModal,
    BottomSheetModal,
    BottomSheetModalProvider,
    BottomSheetView,
    BottomSheetBackdrop,
  };
});
// 原因：@react-native-community/datetimepicker 依赖原生 RNDateTimePicker 视图，在 Jest Node 环境下挂载受控桩并暴露标准 onChange(event, date)
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  function MockDateTimePicker(props) {
    const { testID, value, onChange, minimumDate, maximumDate } = props;
    const basePrefix = typeof testID === 'string' ? testID.replace(/-native$/, '') : undefined;
    const current = value instanceof Date ? value : new Date(1996, 0, 1, 12, 0, 0);

    const emitDate = (year, month, day) => {
      const next = new Date(year, month - 1, day, 12, 0, 0, 0);
      onChange?.(
        {
          type: 'set',
          nativeEvent: { timestamp: next.getTime(), utcOffset: 0 },
        },
        next,
      );
    };

    return React.createElement(
      View,
      {
        testID: testID ?? 'native-datetime-picker',
        value: current,
        minimumDate,
        maximumDate,
        onChange,
      },
      basePrefix
        ? [
            React.createElement(Pressable, {
              key: 'y-1998',
              testID: `${basePrefix}-year-1998`,
              onPress: () => emitDate(1998, current.getMonth() + 1, current.getDate()),
            }),
            React.createElement(Pressable, {
              key: 'm-5',
              testID: `${basePrefix}-month-5`,
              onPress: () => emitDate(current.getFullYear(), 5, current.getDate()),
            }),
            React.createElement(Pressable, {
              key: 'd-18',
              testID: `${basePrefix}-day-18`,
              onPress: () => emitDate(current.getFullYear(), current.getMonth() + 1, 18),
            }),
          ]
        : null,
    );
  }

  return {
    __esModule: true,
    default: MockDateTimePicker,
  };
});

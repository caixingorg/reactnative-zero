import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  GestureDetector,
  usePanGesture,
  type PanGestureConfig,
} from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import { useAppTheme } from '../theme/theme-context';
import {
  clampDrawerProgress,
  DRAWER_EDGE_WIDTH,
  resolveDrawerSnap,
  resolveDrawerWidth,
} from './drawer-logic';
import type { DrawerStore } from './drawer-store';

export interface DrawerHostProps {
  drawerStore: DrawerStore;
  /** 是否允许从屏幕最左边缘拖出；只应在底部导航根页面开启，栈页面里左边缘要留给"左滑返回"。 */
  edgeSwipeEnabled: boolean;
  /** 抽屉里的内容，由应用层注入（核心层不依赖业务）。 */
  children: React.ReactNode;
}

const ANIMATION_MS = 240;

// 原因：全局只挂一个，盖在底部导航之上；关闭时 pointerEvents 为 box-none，只有最左边缘窄条接收手势，不挡下层页面的触摸。
// 进度值（0 关 ~ 1 开）放在 UI 线程的共享值里，拖动时遮罩和面板跟手，不经过 JS 线程。
export function DrawerHost({
  drawerStore,
  edgeSwipeEnabled,
  children,
}: DrawerHostProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const drawerWidth = resolveDrawerWidth(windowWidth);
  const isOpen = useStore(drawerStore, (state) => state.isOpen);
  const open = useStore(drawerStore, (state) => state.open);
  const close = useStore(drawerStore, (state) => state.close);

  // 原因：抽屉内容首次打开或边缘拖动时再懒挂载，避免冷启动首屏常驻渲染整棵侧栏树
  const [hasOpened, setHasOpened] = useState(isOpen);
  const shouldRenderContent = hasOpened || isOpen;
  if (isOpen && !hasOpened) {
    setHasOpened(true);
  }
  const markOpened = useCallback(() => {
    setHasOpened(true);
  }, []);

  const progress = useSharedValue(0);
  const startProgress = useSharedValue(0);

  useEffect(() => {
    progress.set(withTiming(isOpen ? 1 : 0, { duration: ANIMATION_MS }));
  }, [isOpen, progress]);

  // 原因：Android 返回键应先关抽屉，而不是直接退出页面
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [isOpen, close]);

  const dragGesture: PanGestureConfig = {
    // 原因：横向位移超过 8 才激活，纵向先动则放弃，避免和页面内的纵向滚动抢手势
    activeOffsetX: [-8, 8],
    failOffsetY: [-16, 16],
    onBegin: () => {
      'worklet';
      startProgress.set(progress.get());
      scheduleOnRN(markOpened);
    },
    onUpdate: (event) => {
      'worklet';
      progress.set(clampDrawerProgress(startProgress.get(), event.translationX, drawerWidth));
    },
    onDeactivate: (event) => {
      'worklet';
      const target = resolveDrawerSnap(progress.get(), event.velocityX);
      progress.set(withTiming(target === 'open' ? 1 : 0, { duration: ANIMATION_MS }));
      scheduleOnRN(target === 'open' ? open : close);
    },
  };

  // 原因：Gesture Handler 不允许同一个手势实例挂到多个 GestureDetector，面板和边缘条各建一个同配置实例
  const panelGesture = usePanGesture(dragGesture);
  const edgeGesture = usePanGesture(dragGesture);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 1], [0, 0.45]),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.get(), [0, 1], [-drawerWidth, 0]) }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.scrim, scrimStyle]} pointerEvents={isOpen ? 'auto' : 'none'}>
        <Pressable
          testID="drawer-scrim"
          accessibilityRole="button"
          accessibilityLabel="close drawer"
          style={StyleSheet.absoluteFill}
          onPress={close}
        />
      </Animated.View>

      <GestureDetector gesture={panelGesture}>
        <Animated.View
          testID="drawer-panel"
          pointerEvents={isOpen ? 'auto' : 'none'}
          style={[
            styles.panel,
            panelStyle,
            {
              width: drawerWidth,
              backgroundColor: tokens.colors.surface,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          {shouldRenderContent ? children : null}
        </Animated.View>
      </GestureDetector>

      {edgeSwipeEnabled && !isOpen ? (
        <GestureDetector gesture={edgeGesture}>
          <View testID="drawer-edge" style={styles.edge} />
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#000000' },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  edge: { position: 'absolute', top: 0, bottom: 0, left: 0, width: DRAWER_EDGE_WIDTH },
});

/**
 * @module core/ui/TabPager
 * 职责：自研零额外原生依赖的横向分页容器，支持左右滑动切换、单一滚动偏移驱动 TopTabs 指示条、子页首次访问懒挂载且保活。
 * 边界：不持有具体页面内容，纯下标/挂载决策委托给 page-shell-logic。
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';
import { markPageVisited, resolveActiveIndex, shouldMountPage } from './page-shell-logic';

export interface TabPagerProps {
  pageCount: number;
  activeIndex: number;
  onIndexChange: (index: number) => void;
  /** 可选 Reanimated 共享值，由本容器在横向滚动时写入连续页码进度（0 .. pageCount - 1）。 */
  scrollProgress?: SharedValue<number>;
  /** 当子页面内部存在横向滚动栏被触摸时，可临时锁定外层分页滑动避免误切 Tab。 */
  scrollEnabled?: boolean;
  /** 已访问子页的保活半径（默认 1，仅保留当前页与左右相邻页，避免多页常驻导致原生视图膨胀）。 */
  keepAliveRadius?: number;
  renderPage: (index: number, isActive: boolean) => React.ReactNode;
  testID?: string;
}

export function TabPager({
  pageCount,
  activeIndex,
  onIndexChange,
  scrollProgress,
  scrollEnabled = true,
  keepAliveRadius = 1,
  renderPage,
  testID = 'tab-pager',
}: TabPagerProps): React.JSX.Element {
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<React.ComponentRef<typeof Animated.ScrollView>>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const pageWidth = measuredWidth > 0 ? measuredWidth : windowWidth;
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([activeIndex]));
  // 原因：渲染期同步补齐新激活页的访问记录，避免 useEffect 触发额外级联渲染
  const effectiveVisited = markPageVisited(visited, activeIndex);
  if (effectiveVisited !== visited) {
    setVisited(effectiveVisited);
  }

  useEffect(() => {
    if (pageWidth > 0) {
      scrollRef.current?.scrollTo({ x: activeIndex * pageWidth, animated: true });
    } else {
      scrollProgress?.set(activeIndex);
    }
  }, [activeIndex, pageWidth, scrollProgress]);

  const handleLayout = (event: LayoutChangeEvent): void => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0 && nextWidth !== measuredWidth) {
      setMeasuredWidth(nextWidth);
      scrollRef.current?.scrollTo({ x: activeIndex * nextWidth, animated: false });
    }
  };

  // 原因：横向滑动进度在 UI 线程 worklet 中直写 SharedValue，避免每 16ms 跨 JS 线程触发桥接开销
  const handleScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        if (pageWidth <= 0 || pageCount <= 0) {
          return;
        }
        const raw = event.contentOffset.x / pageWidth;
        const clamped = Math.min(pageCount - 1, Math.max(0, raw));
        scrollProgress?.set(clamped);
      },
    },
    [pageCount, pageWidth, scrollProgress],
  );

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const nextIndex = resolveActiveIndex(event.nativeEvent.contentOffset.x, pageWidth, pageCount);
    setVisited((prev) => markPageVisited(prev, nextIndex));
    if (nextIndex !== activeIndex) {
      onIndexChange(nextIndex);
    }
  };

  const pageIndices = Array.from({ length: Math.max(0, pageCount) }, (_, idx) => idx);

  return (
    <View testID={testID} style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        testID="tab-pager-scroll"
        horizontal
        pagingEnabled
        scrollEnabled={scrollEnabled}
        nestedScrollEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onLayout={handleLayout}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        style={styles.flex}
        contentContainerStyle={pageWidth > 0 ? undefined : styles.fallbackContent}
      >
        {pageIndices.map((index) => (
          <View
            key={index}
            testID={`tab-pager-page-${index}`}
            style={[styles.page, pageWidth > 0 ? { width: pageWidth } : styles.flex]}
          >
            {shouldMountPage(effectiveVisited, index, activeIndex, keepAliveRadius)
              ? renderPage(index, index === activeIndex)
              : null}
          </View>
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  fallbackContent: {
    flexGrow: 1,
  },
  page: {
    flex: 1,
    overflow: 'hidden',
  },
});

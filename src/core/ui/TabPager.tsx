/**
 * @module core/ui/TabPager
 * 职责：基于 react-native-pager-view 的横向分页容器，支持左右滑动切换、连续进度驱动 TopTabs 指示条、子页首次访问懒挂载且窗口化保活。
 * 边界：不持有具体页面内容，纯下标/挂载决策委托给 page-shell-logic。
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import type { SharedValue } from 'react-native-reanimated';
import { markPageVisited, shouldMountPage } from './page-shell-logic';

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

function clampPageIndex(index: number, pageCount: number): number {
  if (pageCount <= 0 || !Number.isFinite(index)) {
    return 0;
  }
  return Math.min(pageCount - 1, Math.max(0, Math.round(index)));
}

function reconcileVisitedPages(
  visited: ReadonlySet<number>,
  safePageCount: number,
  resolvedActiveIndex: number,
): ReadonlySet<number> {
  if (safePageCount <= 0) {
    return visited.size > 0 ? new Set<number>() : visited;
  }
  let hasOutOfRange = false;
  for (const page of visited) {
    if (page < 0 || page >= safePageCount) {
      hasOutOfRange = true;
      break;
    }
  }
  if (!hasOutOfRange) {
    return markPageVisited(visited, resolvedActiveIndex);
  }
  const pruned = new Set<number>();
  for (const page of visited) {
    if (page >= 0 && page < safePageCount) {
      pruned.add(page);
    }
  }
  return markPageVisited(pruned, resolvedActiveIndex);
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
  const safePageCount = Number.isFinite(pageCount) ? Math.max(0, Math.floor(pageCount)) : 0;
  const resolvedActiveIndex = clampPageIndex(activeIndex, safePageCount);
  const safeKeepAliveRadius = Number.isFinite(keepAliveRadius)
    ? Math.trunc(keepAliveRadius) || 0
    : 1;

  const pagerRef = useRef<PagerView>(null);
  // 原因：记录原生 PagerView 当前已知页码，区分“外部 activeIndex 变化”与“onPageSelected 回传”，避免 setPage 反馈循环
  const nativePageRef = useRef<number | null>(null);

  const [visited, setVisited] = useState<ReadonlySet<number>>(() =>
    safePageCount > 0 ? new Set([resolvedActiveIndex]) : new Set(),
  );
  // 原因：渲染期同步补齐新激活页并裁剪越界页的访问记录，避免 useEffect 触发额外级联渲染
  const effectiveVisited = reconcileVisitedPages(visited, safePageCount, resolvedActiveIndex);
  if (effectiveVisited !== visited) {
    setVisited(effectiveVisited);
  }

  useEffect(
    () => () => {
      nativePageRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (safePageCount <= 0) {
      nativePageRef.current = null;
      scrollProgress?.set(0);
      return;
    }
    if (scrollProgress) {
      const currentProgress = scrollProgress.get();
      const maxIndex = safePageCount - 1;
      if (!Number.isFinite(currentProgress)) {
        scrollProgress.set(resolvedActiveIndex);
      } else if (currentProgress < 0 || currentProgress > maxIndex) {
        scrollProgress.set(Math.min(maxIndex, Math.max(0, currentProgress)));
      }
    }
    if (nativePageRef.current === null) {
      nativePageRef.current = resolvedActiveIndex;
      return;
    }
    if (nativePageRef.current !== resolvedActiveIndex) {
      nativePageRef.current = resolvedActiveIndex;
      pagerRef.current?.setPage(resolvedActiveIndex);
    }
  }, [resolvedActiveIndex, safePageCount, scrollProgress]);

  const handlePageScroll = (event: PagerViewOnPageScrollEvent): void => {
    if (!scrollProgress || safePageCount <= 0) {
      return;
    }
    const { position, offset } = event.nativeEvent;
    if (!Number.isFinite(position) || !Number.isFinite(offset)) {
      return;
    }
    const maxIndex = Math.max(0, safePageCount - 1);
    const clamped = Math.min(maxIndex, Math.max(0, position + offset));
    scrollProgress.set(clamped);
  };

  const handlePageSelected = (event: PagerViewOnPageSelectedEvent): void => {
    if (safePageCount <= 0) {
      return;
    }
    const rawPosition = event.nativeEvent.position;
    if (!Number.isFinite(rawPosition)) {
      return;
    }
    const nextIndex = clampPageIndex(rawPosition, safePageCount);
    const prevNativePage = nativePageRef.current;
    nativePageRef.current = nextIndex;
    setVisited((prev) => markPageVisited(prev, nextIndex));
    const hasNativeChanged =
      prevNativePage !== null ? prevNativePage !== nextIndex : nextIndex !== resolvedActiveIndex;
    if (hasNativeChanged) {
      onIndexChange(nextIndex);
    }
  };

  if (safePageCount <= 0) {
    return <View testID={testID} style={styles.container} />;
  }

  const pageIndices = Array.from({ length: safePageCount }, (_, idx) => idx);
  const maxOffscreenLimit = Math.min(2147483647, Math.max(1, safePageCount - 1));
  const offscreenPageLimit =
    safeKeepAliveRadius < 0
      ? maxOffscreenLimit
      : Math.min(maxOffscreenLimit, Math.max(1, safeKeepAliveRadius));

  return (
    <View testID={testID} style={styles.container}>
      <PagerView
        ref={pagerRef}
        testID={`${testID}-view`}
        style={styles.flex}
        initialPage={resolvedActiveIndex}
        scrollEnabled={scrollEnabled}
        offscreenPageLimit={offscreenPageLimit}
        onPageScroll={handlePageScroll}
        onPageSelected={handlePageSelected}
      >
        {pageIndices.map((index) => (
          <View key={index} testID={`tab-pager-page-${index}`} style={styles.page}>
            {shouldMountPage(effectiveVisited, index, resolvedActiveIndex, safeKeepAliveRadius)
              ? renderPage(index, index === resolvedActiveIndex)
              : null}
          </View>
        ))}
      </PagerView>
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
  page: {
    flex: 1,
    overflow: 'hidden',
  },
});

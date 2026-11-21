/**
 * @module core/ui/TopTabs
 * 职责：单层顶部多标签切换栏，支持点击切换、指示条跟随联动、选中项自动居中横向滚动、红点/数字角标，
 * 并可选挂载左右插槽（如左侧独立抽屉触发按钮、右侧设置/搜索操作），避免再叠加一层独立 Header。
 * 边界：仅依赖 Design Token 与 Reanimated，不持有分页内容，通过 activeIndex / scrollProgress 与 TabPager 联动。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { HStack } from './Stack';

export interface TopTabItem {
  key: string;
  label: string;
  badgeCount?: number;
  showDot?: boolean;
}

export interface TopTabsProps {
  tabs: readonly TopTabItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /** 可选连续滚动进度（0 .. tabs.length - 1），由 TabPager 驱动指示条实时跟随。 */
  scrollProgress?: SharedValue<number>;
  /** 左侧插槽（如独立的抽屉触发按钮），与二级 Tab 处于同一单层顶栏。 */
  leftSlot?: React.ReactNode;
  /** 右侧插槽（如设置、搜索等操作按钮），与二级 Tab 处于同一单层顶栏。 */
  rightSlot?: React.ReactNode;
  testID?: string;
}

interface TabRect {
  x: number;
  width: number;
}

const INDICATOR_WIDTH = 18;

function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function TopTabs({
  tabs,
  activeIndex,
  onSelect,
  scrollProgress,
  leftSlot,
  rightSlot,
  testID = 'top-tabs',
}: TopTabsProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [tabRects, setTabRects] = useState<Record<number, TabRect>>({});

  const fallbackProgress = useSharedValue(activeIndex);

  useEffect(() => {
    fallbackProgress.set(withTiming(activeIndex, { duration: 180 }));
  }, [activeIndex, fallbackProgress]);

  useEffect(() => {
    const rect = tabRects[activeIndex];
    if (!rect || containerWidth <= 0) {
      return;
    }
    const targetX = Math.max(0, rect.x + rect.width / 2 - containerWidth / 2);
    scrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [activeIndex, containerWidth, tabRects]);

  const activeProgress = scrollProgress ?? fallbackProgress;

  // 原因：根据每个 Tab 实际测量出的中心点插值计算指示条偏移，兼容等宽与不等宽标题；用 useMemo 避免每次渲染重建数组
  const indicatorCenters = useMemo(
    () =>
      tabs.map((_, idx) => {
        const rect = tabRects[idx];
        return rect ? rect.x + rect.width / 2 - INDICATOR_WIDTH / 2 : idx * 72 + 24;
      }),
    [tabRects, tabs],
  );
  const inputRange = useMemo(() => tabs.map((_, idx) => idx), [tabs]);

  const indicatorStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();
    if (inputRange.length <= 1) {
      return { transform: [{ translateX: indicatorCenters[0] ?? 0 }] };
    }
    const translateX = interpolate(progress, inputRange, indicatorCenters);
    return { transform: [{ translateX }] };
  }, [activeProgress, indicatorCenters, inputRange]);

  const handleScrollContainerLayout = (event: LayoutChangeEvent): void => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const handleTabLayout = (index: number, event: LayoutChangeEvent): void => {
    const { x, width } = event.nativeEvent.layout;
    setTabRects((prev) => {
      const existing = prev[index];
      if (existing && existing.x === x && existing.width === width) {
        return prev;
      }
      return { ...prev, [index]: { x, width } };
    });
  };

  return (
    <View
      testID={testID}
      style={[
        styles.wrapper,
        {
          backgroundColor: tokens.colors.surface,
          borderBottomColor: tokens.colors.border,
        },
      ]}
    >
      {leftSlot ? <View style={styles.sideSlot}>{leftSlot}</View> : null}

      <View style={styles.scrollContainer} onLayout={handleScrollContainerLayout}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.tabRow}>
            {tabs.map((tab, index) => {
              const isSelected = index === activeIndex;
              const hasCount = typeof tab.badgeCount === 'number' && tab.badgeCount > 0;
              const showDot = !hasCount && Boolean(tab.showDot);

              return (
                <Pressable
                  key={tab.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={tab.label}
                  testID={`top-tab-${tab.key}`}
                  onLayout={(event) => handleTabLayout(index, event)}
                  onPress={() => onSelect(index)}
                  style={styles.tabItem}
                >
                  <HStack align="center" gap="xs">
                    <AppText
                      variant="bodyMd"
                      tone={isSelected ? 'primary' : 'secondary'}
                      weight={isSelected ? '700' : '500'}
                      style={isSelected ? styles.activeLabel : styles.inactiveLabel}
                    >
                      {tab.label}
                    </AppText>
                    {hasCount ? (
                      <View
                        testID={`top-tab-badge-${tab.key}`}
                        style={[
                          styles.badge,
                          {
                            backgroundColor: tokens.colors.danger,
                            borderRadius: tokens.radii.full,
                          },
                        ]}
                      >
                        <AppText variant="caption" tone="inverse" style={styles.badgeText}>
                          {formatBadgeCount(tab.badgeCount as number)}
                        </AppText>
                      </View>
                    ) : showDot ? (
                      <View
                        testID={`top-tab-dot-${tab.key}`}
                        style={[
                          styles.dot,
                          {
                            backgroundColor: tokens.colors.danger,
                            borderRadius: tokens.radii.full,
                          },
                        ]}
                      />
                    ) : null}
                  </HStack>
                </Pressable>
              );
            })}
            {tabs.length > 0 ? (
              <Animated.View
                testID="top-tabs-indicator"
                style={[
                  styles.indicator,
                  { backgroundColor: tokens.colors.primary },
                  indicatorStyle,
                ]}
              />
            ) : null}
          </View>
        </ScrollView>
      </View>

      {rightSlot ? <View style={styles.sideSlot}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  sideSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    minHeight: 52,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeLabel: {
    fontSize: 17,
    lineHeight: 22,
  },
  inactiveLabel: {
    fontSize: 15,
    lineHeight: 22,
  },
  indicator: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    width: INDICATOR_WIDTH,
    height: 3,
    borderRadius: 99,
  },
  dot: {
    width: 7,
    height: 7,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
});

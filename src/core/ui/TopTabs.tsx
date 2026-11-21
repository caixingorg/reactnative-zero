/**
 * @module core/ui/TopTabs
 * 职责：顶部多标签切换条，支持点击切换、指示条跟随联动、选中项自动居中横向滚动，以及红点/数字角标。
 * 边界：仅依赖 Design Token 与 Reanimated，不持有分页内容，通过 activeIndex / scrollProgress 与 TabPager 联动。
 */
import React, { useEffect, useRef, useState } from 'react';
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
  testID?: string;
}

interface TabRect {
  x: number;
  width: number;
}

const INDICATOR_WIDTH = 24;

function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export function TopTabs({
  tabs,
  activeIndex,
  onSelect,
  scrollProgress,
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

  // 原因：根据每个 Tab 实际测量出的中心点插值计算指示条偏移，兼容等宽与不等宽标题
  const indicatorCenters = tabs.map((_, idx) => {
    const rect = tabRects[idx];
    return rect ? rect.x + rect.width / 2 - INDICATOR_WIDTH / 2 : idx * 72 + 24;
  });

  const indicatorStyle = useAnimatedStyle(() => {
    const progress = activeProgress.get();
    if (tabs.length <= 1) {
      return { transform: [{ translateX: indicatorCenters[0] ?? 0 }] };
    }
    const inputRange = tabs.map((_, idx) => idx);
    const translateX = interpolate(progress, inputRange, indicatorCenters);
    return { transform: [{ translateX }] };
  });

  const handleContainerLayout = (event: LayoutChangeEvent): void => {
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
      onLayout={handleContainerLayout}
      style={[
        styles.wrapper,
        {
          backgroundColor: tokens.colors.surface,
          borderBottomColor: tokens.colors.border,
        },
      ]}
    >
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
                    weight={isSelected ? '600' : '400'}
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
              style={[styles.indicator, { backgroundColor: tokens.colors.primary }, indicatorStyle]}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    minHeight: 44,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: INDICATOR_WIDTH,
    height: 3,
    borderRadius: 2,
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

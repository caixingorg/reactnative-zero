import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useDrawer } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { DrawerTriggerButton, Screen, TabPager, TopTabs, type TopTabItem } from '@/core/ui';
import type { MockListRecord } from '@/shared';
import { HomeFeedSubTab } from '../components/HomeFeedSubTab';
import { HomeRecommendTab } from '../components/HomeRecommendTab';

export interface HomeStarterScreenProps {
  onSelectItem?: (itemId: string) => void;
  onSelectRecord?: (record: MockListRecord) => void;
  onOpenSearch?: () => void;
  onOpenWebView?: () => void;
}

const HOME_TABS: readonly TopTabItem[] = [
  { key: 'recommended', label: '推荐' },
  { key: 'following', label: '关注' },
  { key: 'trending', label: '热榜' },
];

export function HomeStarterScreen({
  onSelectItem,
  onSelectRecord,
  onOpenSearch,
  onOpenWebView,
}: HomeStarterScreenProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const drawer = useDrawer();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);

  return (
    <Screen>
      <TopTabs
        tabs={HOME_TABS}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
        leftSlot={<DrawerTriggerButton testID="home-drawer-button" onPress={drawer.open} />}
        rightSlot={
          onOpenSearch ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="搜索"
              testID="home-search-button"
              onPress={onOpenSearch}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <Ionicons name="search-outline" size={21} color={tokens.colors.textPrimary} />
            </Pressable>
          ) : undefined
        }
      />
      <TabPager
        pageCount={HOME_TABS.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={(index, isActive) => {
          const tabKey = HOME_TABS[index]?.key;
          if (tabKey === 'recommended') {
            return (
              <HomeRecommendTab
                isActive={isActive}
                onSelectItem={onSelectItem}
                onSelectRecord={onSelectRecord}
              />
            );
          }
          if (tabKey === 'following') {
            return (
              <HomeFeedSubTab
                channelKey="following"
                isActive={isActive}
                onSelectRecord={onSelectRecord}
              />
            );
          }
          return (
            <HomeFeedSubTab
              channelKey="trending"
              isActive={isActive}
              onSelectRecord={onSelectRecord}
              onOpenWebView={onOpenWebView}
            />
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

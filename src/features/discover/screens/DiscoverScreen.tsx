import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useDrawer } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppText,
  DrawerTriggerButton,
  HStack,
  ListTemplate,
  Screen,
  TabPager,
  TopTabs,
  VStack,
  type PageStatus,
  type TopTabItem,
} from '@/core/ui';
import { useMockPaginatedFeed, type MockListRecord } from '@/shared';

export interface DiscoverScreenProps {
  onSelectRecord?: (record: MockListRecord) => void;
  onOpenSearch?: () => void;
}

const DISCOVER_TABS: readonly TopTabItem[] = [
  { key: 'categories', label: '分类' },
  { key: 'rankings', label: '榜单' },
  { key: 'topics', label: '专题' },
];

function DiscoverSubTab({
  tabKey,
  isActive,
  onSelectRecord,
}: {
  tabKey: string;
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const feed = useMockPaginatedFeed(tabKey);
  const status: PageStatus =
    feed.isLoading && feed.items.length === 0
      ? 'loading'
      : feed.error && feed.items.length === 0
        ? 'error'
        : feed.items.length === 0
          ? 'empty'
          : 'ready';

  return (
    <View testID={`discover-tab-${tabKey}`} style={styles.flex}>
      <ListTemplate
        data={feed.items}
        keyExtractor={(item) => item.id}
        status={status}
        isActive={isActive}
        refreshing={feed.isRefetching}
        onRefresh={() => {
          void feed.refetch();
        }}
        hasNextPage={feed.hasNextPage}
        isFetchingNextPage={feed.isFetchingNextPage}
        onLoadMore={() => {
          void feed.fetchNextPage();
        }}
        renderItem={(item) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelectRecord?.(item)}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <HStack p="md" gap="md" bg="surface" radius="lg" bordered align="center">
              {item.rank !== undefined ? (
                <View
                  style={[
                    styles.rankBadge,
                    {
                      backgroundColor:
                        item.rank <= 3 ? tokens.colors.primarySoft : tokens.colors.surfaceMuted,
                      borderRadius: tokens.radii.md,
                    },
                  ]}
                >
                  <AppText
                    variant="bodyMd"
                    tone={item.rank <= 3 ? 'brand' : 'secondary'}
                    weight="700"
                  >
                    #{item.rank}
                  </AppText>
                </View>
              ) : null}
              <VStack flex={1} gap="xs">
                <HStack justify="space-between" align="center">
                  <AppText variant="caption" tone="brand" weight="600">
                    {item.tag}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {item.meta}
                  </AppText>
                </HStack>
                <AppText variant="titleMd" numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                  {item.summary}
                </AppText>
              </VStack>
            </HStack>
          </Pressable>
        )}
      />
    </View>
  );
}

export function DiscoverScreen({
  onSelectRecord,
  onOpenSearch,
}: DiscoverScreenProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const drawer = useDrawer();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);

  return (
    <Screen>
      <TopTabs
        tabs={DISCOVER_TABS}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
        leftSlot={<DrawerTriggerButton testID="discover-drawer-button" onPress={drawer.open} />}
        rightSlot={
          onOpenSearch ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="搜索"
              testID="discover-search-button"
              onPress={onOpenSearch}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <Ionicons name="search-outline" size={22} color={tokens.colors.textPrimary} />
            </Pressable>
          ) : undefined
        }
      />
      <TabPager
        pageCount={DISCOVER_TABS.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={(index, isActive) => (
          <DiscoverSubTab
            tabKey={DISCOVER_TABS[index]?.key ?? 'categories'}
            isActive={isActive}
            onSelectRecord={onSelectRecord}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  rankBadge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

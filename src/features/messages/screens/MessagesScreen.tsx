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

export interface MessagesScreenProps {
  onSelectRecord?: (record: MockListRecord) => void;
}

const MESSAGES_TABS: readonly TopTabItem[] = [
  { key: 'notifications', label: '通知', badgeCount: 3 },
  { key: 'interactions', label: '互动', showDot: true },
  { key: 'direct', label: '私信', badgeCount: 1 },
];

function MessagesSubTab({
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
    <View testID={`messages-tab-${tabKey}`} style={styles.flex}>
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
        renderItem={(entry) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelectRecord?.(entry)}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <HStack p="md" gap="md" bg="surface" radius="lg" bordered align="center">
              <View
                style={[
                  styles.unreadDot,
                  {
                    backgroundColor: entry.unread ? tokens.colors.danger : 'transparent',
                    borderRadius: tokens.radii.full,
                  },
                ]}
              />
              <VStack flex={1} gap="xs">
                <HStack justify="space-between" align="center" gap="sm">
                  <AppText variant="bodyMd" weight="600" numberOfLines={1} style={styles.flex}>
                    {entry.title}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {entry.meta}
                  </AppText>
                </HStack>
                <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                  {entry.summary}
                </AppText>
              </VStack>
            </HStack>
          </Pressable>
        )}
      />
    </View>
  );
}

export function MessagesScreen({ onSelectRecord }: MessagesScreenProps = {}): React.JSX.Element {
  const drawer = useDrawer();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);

  return (
    <Screen>
      <TopTabs
        tabs={MESSAGES_TABS}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
        leftSlot={<DrawerTriggerButton testID="messages-drawer-button" onPress={drawer.open} />}
      />
      <TabPager
        pageCount={MESSAGES_TABS.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={(index, isActive) => (
          <MessagesSubTab
            tabKey={MESSAGES_TABS[index]?.key ?? 'notifications'}
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
  unreadDot: {
    width: 8,
    height: 8,
  },
  pressed: {
    opacity: 0.72,
  },
});

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

export interface ProfileScreenProps {
  onOpenSettings?: () => void;
  onSelectRecord?: (record: MockListRecord) => void;
}

const PROFILE_TABS: readonly TopTabItem[] = [
  { key: 'favorites', label: '收藏' },
  { key: 'history', label: '历史' },
  { key: 'activity', label: '动态' },
];

function ProfileSubTab({
  tabKey,
  isActive,
  onSelectRecord,
}: {
  tabKey: string;
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
}): React.JSX.Element {
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
    <View testID={`profile-tab-${tabKey}`} style={styles.flex}>
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
            <VStack p="md" gap="xs" bg="surface" radius="lg" bordered>
              <HStack justify="space-between" align="center">
                <AppText variant="caption" tone="brand" weight="600">
                  {item.tag}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {item.meta}
                </AppText>
              </HStack>
              <AppText variant="bodyMd" weight="600" numberOfLines={2}>
                {item.title}
              </AppText>
              <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                {item.summary}
              </AppText>
            </VStack>
          </Pressable>
        )}
      />
    </View>
  );
}

export function ProfileScreen({
  onOpenSettings,
  onSelectRecord,
}: ProfileScreenProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const drawer = useDrawer();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);

  return (
    <Screen>
      <TopTabs
        tabs={PROFILE_TABS}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
        leftSlot={<DrawerTriggerButton testID="profile-drawer-button" onPress={drawer.open} />}
        rightSlot={
          onOpenSettings ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="设置"
              testID="profile-settings-button"
              onPress={onOpenSettings}
              hitSlop={8}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="settings-outline" size={22} color={tokens.colors.textPrimary} />
            </Pressable>
          ) : undefined
        }
      />
      <TabPager
        pageCount={PROFILE_TABS.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={(index, isActive) => (
          <ProfileSubTab
            tabKey={PROFILE_TABS[index]?.key ?? 'favorites'}
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
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

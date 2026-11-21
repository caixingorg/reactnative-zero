import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useDrawer } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppText,
  DrawerTriggerButton,
  isScrollAtTop,
  PageTemplate,
  Screen,
  TabPager,
  TopTabs,
  VStack,
  type PageActions,
  type TopTabItem,
} from '@/core/ui';

export interface ProfileScreenProps {
  onOpenSettings?: () => void;
}

const PROFILE_TABS: readonly TopTabItem[] = [
  { key: 'favorites', label: '收藏' },
  { key: 'history', label: '历史' },
  { key: 'activity', label: '动态' },
];

const PROFILE_LISTS: Record<string, readonly { id: string; title: string; meta: string }[]> = {
  favorites: [
    { id: 'fav-1', title: '企业级移动底座四层架构规范', meta: '收藏于 今天' },
    { id: 'fav-2', title: 'Reanimated 4 抽屉与分页联动指南', meta: '收藏于 昨天' },
  ],
  history: [
    { id: 'his-1', title: '离线缓存与弱网降级方案', meta: '浏览于 15 分钟前' },
    { id: 'his-2', title: 'Android 包体积守卫配置', meta: '浏览于 2 小时前' },
  ],
  activity: [{ id: 'act-1', title: '完成了本地音乐播放与图片压缩联调', meta: '今天' }],
};

function ProfileSubTab({
  tabKey,
  isActive,
}: {
  tabKey: string;
  isActive: boolean;
}): React.JSX.Element {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offsetYRef = useRef(0);
  const pageActions = useMemo<PageActions>(
    () => ({
      isAtTop: () => isScrollAtTop(offsetYRef.current),
      scrollToTop: () => scrollRef.current?.scrollTo({ y: 0, animated: true }),
      refresh: () => undefined,
    }),
    [],
  );

  const items = PROFILE_LISTS[tabKey] ?? [];

  return (
    <PageTemplate status="ready" isActive={isActive} pageActions={pageActions}>
      <ScrollView
        ref={scrollRef}
        testID={`profile-tab-${tabKey}`}
        scrollEventThrottle={16}
        onScroll={(event) => {
          offsetYRef.current = event.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={styles.content}
      >
        {items.map((item) => (
          <VStack key={item.id} p="md" gap="xs" bg="surface" radius="lg" bordered>
            <AppText variant="bodyMd" weight="600">
              {item.title}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {item.meta}
            </AppText>
          </VStack>
        ))}
      </ScrollView>
    </PageTemplate>
  );
}

export function ProfileScreen({ onOpenSettings }: ProfileScreenProps = {}): React.JSX.Element {
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
          <ProfileSubTab tabKey={PROFILE_TABS[index]?.key ?? 'favorites'} isActive={isActive} />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
});

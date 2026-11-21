import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useDrawer } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppHeader,
  AppText,
  HStack,
  isScrollAtTop,
  PageTemplate,
  Screen,
  TabPager,
  TopTabs,
  VStack,
  type PageActions,
  type TopTabItem,
} from '@/core/ui';

const MESSAGES_TABS: readonly TopTabItem[] = [
  { key: 'notifications', label: '通知', badgeCount: 3 },
  { key: 'interactions', label: '互动', showDot: true },
  { key: 'direct', label: '私信', badgeCount: 1 },
];

interface MessageEntry {
  id: string;
  title: string;
  preview: string;
  time: string;
  unread?: boolean;
}

const MESSAGE_LISTS: Record<string, readonly MessageEntry[]> = {
  notifications: [
    {
      id: 'n-1',
      title: '系统公告',
      preview: '新版本页面骨架已发布预览',
      time: '10 分钟前',
      unread: true,
    },
    {
      id: 'n-2',
      title: '安全提醒',
      preview: '账号已在新设备上完成校验',
      time: '1 小时前',
      unread: true,
    },
    { id: 'n-3', title: '构建通知', preview: 'Android 调试包校验通过', time: '昨天', unread: true },
  ],
  interactions: [
    {
      id: 'i-1',
      title: '林晚 赞了你的动态',
      preview: '“跨端工程化与四层架构治理实践”',
      time: '30 分钟前',
      unread: true,
    },
    { id: 'i-2', title: '陈明 评论了你', preview: '这个抽屉手势隔离方案很清晰', time: '昨天' },
  ],
  direct: [
    {
      id: 'd-1',
      title: '产品助手',
      preview: '请查收本周迭代排期与验收清单',
      time: '刚刚',
      unread: true,
    },
  ],
};

function MessagesSubTab({
  tabKey,
  isActive,
}: {
  tabKey: string;
  isActive: boolean;
}): React.JSX.Element {
  const { tokens } = useAppTheme();
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

  const entries = MESSAGE_LISTS[tabKey] ?? [];

  return (
    <PageTemplate status="ready" isActive={isActive} pageActions={pageActions}>
      <ScrollView
        ref={scrollRef}
        testID={`messages-tab-${tabKey}`}
        scrollEventThrottle={16}
        onScroll={(event) => {
          offsetYRef.current = event.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={styles.content}
      >
        {entries.map((entry) => (
          <HStack key={entry.id} p="md" gap="md" bg="surface" radius="lg" bordered align="center">
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
              <HStack justify="space-between" align="center">
                <AppText variant="bodyMd" weight="600">
                  {entry.title}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {entry.time}
                </AppText>
              </HStack>
              <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                {entry.preview}
              </AppText>
            </VStack>
          </HStack>
        ))}
      </ScrollView>
    </PageTemplate>
  );
}

export function MessagesScreen(): React.JSX.Element {
  const { tokens } = useAppTheme();
  const drawer = useDrawer();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);

  return (
    <Screen>
      <AppHeader
        title="消息"
        leftAction={{
          icon: <Ionicons name="menu-outline" size={24} color={tokens.colors.textPrimary} />,
          accessibilityLabel: '打开菜单',
          onPress: drawer.open,
          testID: 'messages-drawer-button',
        }}
      />
      <TopTabs
        tabs={MESSAGES_TABS}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
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
          />
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
  unreadDot: {
    width: 8,
    height: 8,
  },
});

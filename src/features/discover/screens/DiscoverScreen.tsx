import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useDrawer } from '@/core/runtime';
import {
  AppText,
  DrawerTriggerButton,
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

const DISCOVER_TABS: readonly TopTabItem[] = [
  { key: 'categories', label: '分类' },
  { key: 'rankings', label: '榜单' },
  { key: 'topics', label: '专题' },
];

const CATEGORIES = [
  { id: 'cat-1', name: '移动架构', count: '128 篇' },
  { id: 'cat-2', name: '设计系统', count: '94 篇' },
  { id: 'cat-3', name: '性能优化', count: '76 篇' },
  { id: 'cat-4', name: '工程交付', count: '63 篇' },
] as const;

const RANKINGS = [
  { id: 'rank-1', rank: 1, title: '零依赖 Design Token 主题方案', score: '9.6' },
  { id: 'rank-2', rank: 2, title: '跨端手势与抽屉交互实践', score: '9.3' },
  { id: 'rank-3', rank: 3, title: '弱网离线优先架构清单', score: '9.1' },
] as const;

const TOPICS = [
  { id: 'topic-1', title: '企业级 RN 模板落地合集', summary: '从初始化裁剪到真机发布的全流程专题' },
  { id: 'topic-2', title: '移动端可观测性与稳定性', summary: '启动打点、包体积守卫与崩溃治理' },
] as const;

function DiscoverSubTab({
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

  return (
    <PageTemplate status="ready" isActive={isActive} pageActions={pageActions}>
      <ScrollView
        ref={scrollRef}
        testID={`discover-tab-${tabKey}`}
        scrollEventThrottle={16}
        onScroll={(event) => {
          offsetYRef.current = event.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={styles.content}
      >
        {tabKey === 'categories' ? (
          <View style={styles.grid}>
            {CATEGORIES.map((item) => (
              <VStack
                key={item.id}
                p="md"
                gap="xs"
                bg="surface"
                radius="lg"
                bordered
                style={styles.gridCard}
              >
                <AppText variant="titleMd">{item.name}</AppText>
                <AppText variant="caption" tone="secondary">
                  {item.count}
                </AppText>
              </VStack>
            ))}
          </View>
        ) : tabKey === 'rankings' ? (
          RANKINGS.map((item) => (
            <HStack key={item.id} p="md" gap="md" bg="surface" radius="lg" bordered align="center">
              <AppText variant="titleMd" tone="brand" weight="700">
                #{item.rank}
              </AppText>
              <VStack flex={1} gap="xs">
                <AppText variant="bodyMd" weight="600">
                  {item.title}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  评分 {item.score}
                </AppText>
              </VStack>
            </HStack>
          ))
        ) : (
          TOPICS.map((item) => (
            <VStack key={item.id} p="md" gap="xs" bg="surface" radius="lg" bordered>
              <AppText variant="titleMd">{item.title}</AppText>
              <AppText variant="bodySm" tone="secondary">
                {item.summary}
              </AppText>
            </VStack>
          ))
        )}
      </ScrollView>
    </PageTemplate>
  );
}

export function DiscoverScreen(): React.JSX.Element {
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
      />
      <TabPager
        pageCount={DISCOVER_TABS.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={(index, isActive) => (
          <DiscoverSubTab tabKey={DISCOVER_TABS[index]?.key ?? 'categories'} isActive={isActive} />
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: '47%',
  },
});

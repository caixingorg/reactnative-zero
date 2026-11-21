import { Ionicons } from '@expo/vector-icons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { AppApiError } from '@/core/network/types';
import { useAppRuntime, useConnectivity, useDevTools, useDrawer } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppHeader,
  AppImage,
  AppText,
  Box,
  Button,
  EmptyState,
  HStack,
  isScrollAtTop,
  PageTemplate,
  Screen,
  Skeleton,
  TabPager,
  TopTabs,
  VStack,
  type PageActions,
  type PageStatus,
  type TopTabItem,
} from '@/core/ui';
import { FeedStatusBadge, VariantCapsuleBadge } from '@/shared';
import { fetchFeedPage } from '../api/feed-api';
import type { FeedSummaryItem } from '../types';

export interface HomeStarterScreenProps {
  onSelectItem?: (itemId: string) => void;
}

const HOME_TABS: readonly TopTabItem[] = [
  { key: 'recommended', label: '推荐' },
  { key: 'following', label: '关注' },
  { key: 'trending', label: '热榜' },
];

const FOLLOWING_PLACEHOLDER_ITEMS = [
  { id: 'follow-1', author: '架构周报', title: '跨端工程化与四层架构治理实践', meta: '2 小时前' },
  { id: 'follow-2', author: '移动效能组', title: '列表滚动性能与包体积守卫经验总结', meta: '昨天' },
] as const;

const TRENDING_PLACEHOLDER_ITEMS = [
  { id: 'hot-1', rank: 1, title: '通用页面骨架与抽屉手势规范', heat: '9.8k 热度' },
  { id: 'hot-2', rank: 2, title: '离线缓存与弱网降级方案', heat: '7.4k 热度' },
  { id: 'hot-3', rank: 3, title: '端到端真机调试与发布流水线', heat: '5.1k 热度' },
] as const;

// 原因：仅允许后端信封明确返回的可读业务错误提示呈现给终端用户，屏蔽底层网关超时/状态码/连接栈等技术细节泄露
function formatUserFacingError(error: unknown, fallbackCopy: string): string {
  if (error instanceof AppApiError && error.kind === 'business') {
    return error.message;
  }
  return fallbackCopy;
}

interface RecommendedFeedTabProps {
  isActive: boolean;
  onSelectItem?: (itemId: string) => void;
}

function RecommendedFeedTab({
  isActive,
  onSelectItem,
}: RecommendedFeedTabProps): React.JSX.Element {
  const { t } = useTranslation();
  const { httpClient } = useAppRuntime();
  const isOnline = useConnectivity((state) => state.isOnline);
  const effectiveApiBaseUrl = useDevTools((state) => state.effectiveApiBaseUrl);
  const listRef = useRef<FlashListRef<FeedSummaryItem>>(null);
  const scrollOffsetYRef = useRef(0);

  const {
    data,
    error,
    isLoading,
    isRefetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['feed', 'list'],
    meta: { persistOffline: true },
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchFeedPage(httpClient, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
  });

  const items = useMemo<FeedSummaryItem[]>(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const pageActions = useMemo<PageActions>(
    () => ({
      isAtTop: () => isScrollAtTop(scrollOffsetYRef.current),
      scrollToTop: () => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
      refresh: () => {
        void refetch();
      },
    }),
    [refetch],
  );

  const status: PageStatus =
    isLoading && items.length === 0
      ? 'loading'
      : !isOnline && items.length === 0
        ? 'offline'
        : error && items.length === 0
          ? 'error'
          : 'ready';

  const metaHeader = (
    <VStack gap="xs" py="sm">
      <HStack gap="sm" align="center">
        <VariantCapsuleBadge />
        <AppText variant="caption" tone="secondary">
          {effectiveApiBaseUrl}
        </AppText>
      </HStack>
      <AppText variant="bodySm" tone="secondary">
        {t('home.feedTitle')}
      </AppText>
    </VStack>
  );

  return (
    <PageTemplate
      status={status}
      isActive={isActive}
      pageActions={pageActions}
      errorTitle={t('home.errorTitle')}
      errorDescription={formatUserFacingError(error, t('home.errorNetworkDescription'))}
      retryLabel={t('common.retry')}
      onRetry={() => {
        void refetch();
      }}
      skeleton={
        <>
          {metaHeader}
          <Skeleton height={88} />
          <Skeleton height={88} />
          <Skeleton height={88} />
        </>
      }
    >
      <Box flex={1} px="lg">
        <VStack flex={1} gap="sm">
          {error ? (
            <HStack
              p="sm"
              gap="sm"
              bg="surfaceMuted"
              radius="md"
              bordered
              justify="space-between"
              align="center"
            >
              <Box flex={1}>
                <AppText variant="caption" tone="danger">
                  {formatUserFacingError(error, t('home.errorNetworkDescription'))}
                </AppText>
              </Box>
              <Button
                label={t('common.retry')}
                variant="outline"
                onPress={() => {
                  void refetch();
                }}
              />
            </HStack>
          ) : null}
          <FlashList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            refreshing={isRefetching}
            onRefresh={() => {
              void refetch();
            }}
            onScroll={(event) => {
              scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage && !error) {
                void fetchNextPage();
              }
            }}
            ListHeaderComponent={metaHeader}
            ListEmptyComponent={
              <EmptyState title={t('home.emptyTitle')} description={t('home.emptyDescription')} />
            }
            ItemSeparatorComponent={() => <Box py="xs" />}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" onPress={() => onSelectItem?.(item.id)}>
                <HStack p="md" gap="md" bg="surface" radius="lg" bordered align="center">
                  <AppImage uri={item.coverUrl} width={64} height={64} />
                  <VStack flex={1} gap="xs">
                    <HStack justify="space-between" align="center" gap="sm">
                      <AppText variant="caption" tone="brand" weight="600">
                        {item.category}
                      </AppText>
                      <FeedStatusBadge status={item.status} />
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
            ListFooterComponent={
              items.length > 0 ? (
                <Box py="lg">
                  {hasNextPage ? (
                    <Button
                      label={t('home.loadMoreButton')}
                      variant="outline"
                      loading={isFetchingNextPage}
                      onPress={() => {
                        void fetchNextPage();
                      }}
                    />
                  ) : (
                    <AppText variant="caption" tone="secondary" align="center">
                      {t('home.allLoadedHint')}
                    </AppText>
                  )}
                </Box>
              ) : null
            }
          />
        </VStack>
      </Box>
    </PageTemplate>
  );
}

function FollowingTab({ isActive }: { isActive: boolean }): React.JSX.Element {
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
        testID="home-tab-following"
        scrollEventThrottle={16}
        onScroll={(event) => {
          offsetYRef.current = event.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={styles.subTabContent}
      >
        {FOLLOWING_PLACEHOLDER_ITEMS.map((entry) => (
          <VStack key={entry.id} p="md" gap="xs" bg="surface" radius="lg" bordered>
            <HStack justify="space-between" align="center">
              <AppText variant="caption" tone="brand" weight="600">
                {entry.author}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {entry.meta}
              </AppText>
            </HStack>
            <AppText variant="titleMd">{entry.title}</AppText>
          </VStack>
        ))}
      </ScrollView>
    </PageTemplate>
  );
}

function TrendingTab({ isActive }: { isActive: boolean }): React.JSX.Element {
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
        testID="home-tab-trending"
        scrollEventThrottle={16}
        onScroll={(event) => {
          offsetYRef.current = event.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={styles.subTabContent}
      >
        {TRENDING_PLACEHOLDER_ITEMS.map((entry) => (
          <HStack key={entry.id} p="md" gap="md" bg="surface" radius="lg" bordered align="center">
            <AppText variant="titleMd" tone="brand" weight="700">
              {entry.rank}
            </AppText>
            <VStack flex={1} gap="xs">
              <AppText variant="bodyMd" weight="600">
                {entry.title}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {entry.heat}
              </AppText>
            </VStack>
          </HStack>
        ))}
      </ScrollView>
    </PageTemplate>
  );
}

export function HomeStarterScreen({
  onSelectItem,
}: HomeStarterScreenProps = {}): React.JSX.Element {
  const { identity } = useAppRuntime();
  const { tokens } = useAppTheme();
  const drawer = useDrawer();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);

  return (
    <Screen>
      <AppHeader
        title={identity.displayName}
        leftAction={{
          icon: <Ionicons name="menu-outline" size={24} color={tokens.colors.textPrimary} />,
          accessibilityLabel: '打开菜单',
          onPress: drawer.open,
          testID: 'home-drawer-button',
        }}
      />
      <TopTabs
        tabs={HOME_TABS}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
      />
      <TabPager
        pageCount={HOME_TABS.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={(index, isActive) => {
          const tabKey = HOME_TABS[index]?.key;
          if (tabKey === 'recommended') {
            return <RecommendedFeedTab isActive={isActive} onSelectItem={onSelectItem} />;
          }
          if (tabKey === 'following') {
            return <FollowingTab isActive={isActive} />;
          }
          return <TrendingTab isActive={isActive} />;
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subTabContent: {
    padding: 16,
    gap: 12,
  },
});

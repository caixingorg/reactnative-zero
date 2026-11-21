import { Ionicons } from '@expo/vector-icons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { AppApiError } from '@/core/network/types';
import { useAppRuntime, useConnectivity, useDrawer } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppImage,
  AppText,
  Box,
  Button,
  DrawerTriggerButton,
  EmptyState,
  HStack,
  isScrollAtTop,
  ListTemplate,
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
import { FeedStatusBadge, useMockPaginatedFeed, type MockListRecord } from '@/shared';
import { fetchFeedPage } from '../api/feed-api';
import type { FeedSummaryItem } from '../types';

export interface HomeStarterScreenProps {
  onSelectItem?: (itemId: string) => void;
  onSelectRecord?: (record: MockListRecord) => void;
  onOpenSearch?: () => void;
}

const HOME_TABS: readonly TopTabItem[] = [
  { key: 'recommended', label: '推荐' },
  { key: 'following', label: '关注' },
  { key: 'trending', label: '热榜' },
];

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
  const { tokens } = useAppTheme();
  const isOnline = useConnectivity((state) => state.isOnline);
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
          <Skeleton height={108} />
          <Skeleton height={108} />
          <Skeleton height={108} />
        </>
      }
    >
      <Box flex={1} px="md">
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
            contentContainerStyle={styles.feedListContent}
            ListEmptyComponent={
              <EmptyState title={t('home.emptyTitle')} description={t('home.emptyDescription')} />
            }
            ItemSeparatorComponent={() => <Box py="xs" />}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => onSelectItem?.(item.id)}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <HStack p="md" gap="md" bg="surface" radius="lg" bordered align="center">
                  <VStack flex={1} gap="xs">
                    <HStack align="center" gap="sm">
                      <View
                        style={[
                          styles.tagPill,
                          {
                            backgroundColor: tokens.colors.primarySoft,
                            borderRadius: tokens.radii.sm,
                          },
                        ]}
                      >
                        <AppText variant="caption" tone="brand" weight="600">
                          {item.category}
                        </AppText>
                      </View>
                      <FeedStatusBadge status={item.status} />
                    </HStack>
                    <AppText variant="titleMd" numberOfLines={2}>
                      {item.title}
                    </AppText>
                    <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                      {item.summary}
                    </AppText>
                  </VStack>
                  <AppImage uri={item.coverUrl} width={88} height={88} />
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

interface AsyncHomeSubTabProps {
  channelKey: 'following' | 'trending';
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
}

function AsyncHomeSubTab({
  channelKey,
  isActive,
  onSelectRecord,
}: AsyncHomeSubTabProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const feed = useMockPaginatedFeed(channelKey);
  const status: PageStatus =
    feed.isLoading && feed.items.length === 0
      ? 'loading'
      : feed.error && feed.items.length === 0
        ? 'error'
        : feed.items.length === 0
          ? 'empty'
          : 'ready';

  return (
    <View testID={`home-tab-${channelKey}`} style={styles.flex}>
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
              {entry.rank !== undefined ? (
                <View
                  style={[
                    styles.rankBadge,
                    {
                      backgroundColor:
                        entry.rank <= 3 ? tokens.colors.primarySoft : tokens.colors.surfaceMuted,
                      borderRadius: tokens.radii.md,
                    },
                  ]}
                >
                  <AppText
                    variant="bodyMd"
                    tone={entry.rank <= 3 ? 'brand' : 'secondary'}
                    weight="700"
                  >
                    {entry.rank}
                  </AppText>
                </View>
              ) : null}
              <VStack flex={1} gap="xs">
                <HStack justify="space-between" align="center">
                  <AppText variant="caption" tone="brand" weight="600">
                    {entry.tag}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {entry.meta}
                  </AppText>
                </HStack>
                <AppText variant="titleMd" numberOfLines={2}>
                  {entry.title}
                </AppText>
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

export function HomeStarterScreen({
  onSelectItem,
  onSelectRecord,
  onOpenSearch,
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
              <Ionicons name="search-outline" size={22} color={tokens.colors.textPrimary} />
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
            return <RecommendedFeedTab isActive={isActive} onSelectItem={onSelectItem} />;
          }
          if (tabKey === 'following') {
            return (
              <AsyncHomeSubTab
                channelKey="following"
                isActive={isActive}
                onSelectRecord={onSelectRecord}
              />
            );
          }
          return (
            <AsyncHomeSubTab
              channelKey="trending"
              isActive={isActive}
              onSelectRecord={onSelectRecord}
            />
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  feedListContent: {
    paddingVertical: 12,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rankBadge: {
    width: 32,
    height: 32,
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

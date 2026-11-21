import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import React, { memo, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { AppApiError } from '@/core/network/types';
import { useAppRuntime, useConnectivity } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppImage,
  AppText,
  Box,
  Button,
  EmptyState,
  HStack,
  isScrollAtTop,
  PageTemplate,
  Skeleton,
  VStack,
  type PageActions,
  type PageStatus,
} from '@/core/ui';
import { FeedStatusBadge, type MockListRecord } from '@/shared';
import { fetchFeedPage } from '../api/feed-api';
import type { FeedSummaryItem } from '../types';
import { HomeEditorialHeader } from './HomeEditorialHeader';

// 原因：仅允许后端信封明确返回的可读业务错误提示呈现给终端用户，屏蔽底层网关超时/状态码/连接栈等技术细节泄露
function formatUserFacingError(error: unknown, fallbackCopy: string): string {
  if (error instanceof AppApiError && error.kind === 'business') {
    return error.message;
  }
  return fallbackCopy;
}

const ArticleRow = memo(function ArticleRow({
  item,
  onSelectItem,
}: {
  item: FeedSummaryItem;
  onSelectItem?: (itemId: string) => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelectItem?.(item.id)}
      style={({ pressed }) => [styles.articleRow, pressed && styles.pressed]}
    >
      <HStack gap="md" align="center">
        <VStack flex={1} gap="xs">
          <AppText variant="bodyMd" weight="700" numberOfLines={2}>
            {item.title}
          </AppText>
          <AppText variant="bodySm" tone="secondary" numberOfLines={1}>
            {item.summary}
          </AppText>
          <HStack align="center" gap="sm" style={styles.articleMetaRow}>
            <AppText variant="caption" tone="brand" weight="700" numberOfLines={1}>
              {item.category}
            </AppText>
            <FeedStatusBadge status={item.status} />
          </HStack>
        </VStack>
        <AppImage uri={item.coverUrl} width={92} height={68} />
      </HStack>
    </Pressable>
  );
});

function HairlineDivider(): React.JSX.Element {
  const { tokens } = useAppTheme();
  return <View style={[styles.hairlineDivider, { backgroundColor: tokens.colors.border }]} />;
}

const extractFeedId = (item: FeedSummaryItem): string => item.id;

export interface HomeRecommendTabProps {
  isActive: boolean;
  onSelectItem?: (itemId: string) => void;
  onSelectRecord?: (record: MockListRecord) => void;
}

export function HomeRecommendTab({
  isActive,
  onSelectItem,
  onSelectRecord,
}: HomeRecommendTabProps): React.JSX.Element {
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

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !error) {
      void fetchNextPage();
    }
  }, [error, fetchNextPage, hasNextPage, isFetchingNextPage]);

  const renderArticle = useCallback(
    ({ item }: ListRenderItemInfo<FeedSummaryItem>) => (
      <ArticleRow item={item} onSelectItem={onSelectItem} />
    ),
    [onSelectItem],
  );

  const headerElement = useMemo(
    () => <HomeEditorialHeader onSelectRecord={onSelectRecord} />,
    [onSelectRecord],
  );

  return (
    <PageTemplate
      status={status}
      isActive={isActive}
      pageActions={pageActions}
      errorTitle={t('home.errorTitle')}
      errorDescription={formatUserFacingError(error, t('home.errorNetworkDescription'))}
      retryLabel={t('common.retry')}
      onRetry={handleRefresh}
      skeleton={
        <VStack gap="md">
          <Skeleton height={184} />
          <HStack gap="sm">
            <Box flex={1}>
              <Skeleton height={104} />
            </Box>
            <Box flex={1}>
              <Skeleton height={104} />
            </Box>
          </HStack>
          <Skeleton height={84} />
        </VStack>
      }
    >
      <View style={[styles.flex, styles.listOuter, { backgroundColor: tokens.colors.surface }]}>
        {error ? (
          <HStack
            p="sm"
            gap="sm"
            bg="surfaceMuted"
            radius="md"
            justify="space-between"
            align="center"
            style={styles.errorBanner}
          >
            <Box flex={1}>
              <AppText variant="caption" tone="danger">
                {formatUserFacingError(error, t('home.errorNetworkDescription'))}
              </AppText>
            </Box>
            <Button label={t('common.retry')} variant="outline" onPress={handleRefresh} />
          </HStack>
        ) : null}

        <FlashList
          ref={listRef}
          data={items}
          keyExtractor={extractFeedId}
          refreshing={isRefetching}
          onRefresh={handleRefresh}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReachedThreshold={0.4}
          onEndReached={handleEndReached}
          ListHeaderComponent={headerElement}
          contentContainerStyle={styles.feedListContent}
          ListEmptyComponent={
            <EmptyState title={t('home.emptyTitle')} description={t('home.emptyDescription')} />
          }
          ItemSeparatorComponent={HairlineDivider}
          renderItem={renderArticle}
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
      </View>
    </PageTemplate>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listOuter: {
    paddingHorizontal: 16,
  },
  feedListContent: {
    paddingBottom: 20,
  },
  errorBanner: {
    marginTop: 8,
  },
  articleRow: {
    paddingVertical: 14,
  },
  articleMetaRow: {
    marginTop: 2,
  },
  hairlineDivider: {
    height: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.72,
  },
});

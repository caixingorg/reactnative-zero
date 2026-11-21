import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { AppApiError } from '@/core/network/types';
import { useDevTools, useAppRuntime } from '@/core/runtime';
import {
  AppImage,
  AppText,
  Box,
  Button,
  EmptyState,
  HStack,
  Screen,
  Skeleton,
  VStack,
} from '@/core/ui';
import { FeedStatusBadge, VariantCapsuleBadge } from '@/shared';
import { fetchFeedPage } from '../api/feed-api';
import type { FeedSummaryItem } from '../types';

export interface HomeStarterScreenProps {
  onSelectItem?: (itemId: string) => void;
}

// 原因：仅允许后端信封明确返回的可读业务错误提示呈现给终端用户，屏蔽底层网关超时/状态码/连接栈等技术细节泄露
function formatUserFacingError(error: unknown, fallbackCopy: string): string {
  if (error instanceof AppApiError && error.kind === 'business') {
    return error.message;
  }
  return fallbackCopy;
}

export function HomeStarterScreen({
  onSelectItem,
}: HomeStarterScreenProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { identity, httpClient } = useAppRuntime();
  const effectiveApiBaseUrl = useDevTools((state) => state.effectiveApiBaseUrl);

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

  const headerNode = (
    <VStack gap="xs" py="md">
      <HStack gap="sm" align="center">
        <VariantCapsuleBadge />
        <AppText variant="caption" tone="secondary">
          {effectiveApiBaseUrl}
        </AppText>
      </HStack>
      <AppText variant="titleLg">{identity.displayName}</AppText>
      <AppText variant="bodySm" tone="secondary">
        {t('home.feedTitle')}
      </AppText>
    </VStack>
  );

  return (
    <Screen>
      <Box flex={1} px="lg">
        {isLoading && items.length === 0 ? (
          <VStack gap="md">
            {headerNode}
            <Skeleton height={88} />
            <Skeleton height={88} />
            <Skeleton height={88} />
          </VStack>
        ) : error && items.length === 0 ? (
          <VStack gap="md">
            {headerNode}
            <EmptyState
              title={t('home.errorTitle')}
              description={formatUserFacingError(error, t('home.errorNetworkDescription'))}
              actionLabel={t('common.retry')}
              onAction={() => {
                void refetch();
              }}
            />
          </VStack>
        ) : (
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
              data={items}
              keyExtractor={(item) => item.id}
              refreshing={isRefetching}
              onRefresh={() => {
                void refetch();
              }}
              onEndReachedThreshold={0.4}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage && !error) {
                  void fetchNextPage();
                }
              }}
              ListHeaderComponent={headerNode}
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
        )}
      </Box>
    </Screen>
  );
}

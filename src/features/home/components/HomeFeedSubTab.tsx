import Ionicons from '@expo/vector-icons/Ionicons';
import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, HStack, ListTemplate, VStack, type PageStatus } from '@/core/ui';
import { QuickComposerCard, useMockPaginatedFeed, type MockListRecord } from '@/shared';

const HomeSubTabRow = memo(function HomeSubTabRow({
  entry,
  onSelectRecord,
}: {
  entry: MockListRecord;
  onSelectRecord?: (record: MockListRecord) => void;
}): React.JSX.Element {
  const { tokens } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelectRecord?.(entry)}
      style={({ pressed }) => [
        styles.editorialSubRow,
        { borderBottomColor: tokens.colors.border },
        pressed && styles.pressed,
      ]}
    >
      <HStack gap="md" align="flex-start">
        {entry.rank !== undefined ? (
          <AppText
            variant="titleMd"
            tone={entry.rank <= 3 ? 'brand' : 'secondary'}
            weight="700"
            style={styles.rankNumber}
          >
            {String(entry.rank).padStart(2, '0')}
          </AppText>
        ) : null}
        <VStack flex={1} gap="xs">
          <AppText variant="bodyMd" weight="700" numberOfLines={2}>
            {entry.title}
          </AppText>
          <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
            {entry.summary}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            <AppText variant="caption" tone="brand" weight="600">
              {entry.tag}
            </AppText>
            {`  ·  ${entry.meta}`}
          </AppText>
        </VStack>
      </HStack>
    </Pressable>
  );
});

const extractRecordKey = (item: MockListRecord): string => item.id;

export interface HomeFeedSubTabProps {
  channelKey: 'following' | 'trending';
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
  onOpenWebView?: () => void;
}

export function HomeFeedSubTab({
  channelKey,
  isActive,
  onSelectRecord,
  onOpenWebView,
}: HomeFeedSubTabProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const feed = useMockPaginatedFeed(channelKey);
  const { refetch, fetchNextPage } = feed;

  const status: PageStatus =
    feed.isLoading && feed.items.length === 0
      ? 'loading'
      : feed.error && feed.items.length === 0
        ? 'error'
        : feed.items.length === 0
          ? 'empty'
          : 'ready';

  const listHeader = useMemo(
    () =>
      channelKey === 'following' ? (
        <QuickComposerCard />
      ) : (
        <Pressable
          testID="home-trending-banner"
          accessibilityRole="button"
          onPress={onOpenWebView}
          style={({ pressed }) => [styles.trendingBanner, pressed && styles.pressed]}
        >
          <HStack align="center" justify="space-between" gap="md">
            <VStack flex={1} gap="xs">
              <AppText variant="caption" style={styles.heroMetaText} weight="700">
                H5 专题策划
              </AppText>
              <AppText variant="titleMd" style={styles.heroTitle}>
                2026 移动端工程化白皮书
              </AppText>
              <AppText variant="caption" style={styles.heroMetaText}>
                点击打开安全混合 WebView 互动专题 →
              </AppText>
            </VStack>
            <Ionicons name="open-outline" size={20} color="#FFFFFF" />
          </HStack>
        </Pressable>
      ),
    [channelKey, onOpenWebView],
  );

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const renderEntry = useCallback(
    (entry: MockListRecord) => <HomeSubTabRow entry={entry} onSelectRecord={onSelectRecord} />,
    [onSelectRecord],
  );

  return (
    <View
      testID={`home-tab-${channelKey}`}
      style={[styles.flex, { backgroundColor: tokens.colors.surface }]}
    >
      <ListTemplate
        data={feed.items}
        keyExtractor={extractRecordKey}
        status={status}
        isActive={isActive}
        listHeader={listHeader}
        refreshing={feed.isRefetching}
        onRefresh={handleRefresh}
        hasNextPage={feed.hasNextPage}
        isFetchingNextPage={feed.isFetchingNextPage}
        onLoadMore={handleLoadMore}
        renderItem={renderEntry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  heroTitle: {
    color: '#FFFFFF',
  },
  heroMetaText: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  trendingBanner: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#1E2433',
    marginBottom: 8,
  },
  editorialSubRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rankNumber: {
    width: 28,
  },
  pressed: {
    opacity: 0.72,
  },
});

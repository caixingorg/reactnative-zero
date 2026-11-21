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
import {
  FeedStatusBadge,
  QuickComposerCard,
  useMockPaginatedFeed,
  type MockListRecord,
} from '@/shared';
import { fetchFeedPage } from '../api/feed-api';
import type { FeedSummaryItem } from '../types';

export interface HomeStarterScreenProps {
  onSelectItem?: (itemId: string) => void;
  onSelectRecord?: (record: MockListRecord) => void;
  onOpenSearch?: () => void;
  onOpenWebView?: () => void;
}

const HOME_TABS: readonly TopTabItem[] = [
  { key: 'recommended', label: '推荐' },
  { key: 'following', label: '关注' },
  { key: 'trending', label: '热榜' },
];

const FEATURED_CAROUSEL = [
  {
    id: 'col-1',
    tag: '效率工具',
    title: '年度 App 精选榜单',
    bg: '#1E293B',
    summary: '精选今年最值得长期使用的效率与专注工具组合。',
  },
  {
    id: 'col-2',
    tag: '桌面美学',
    title: '极简工作流改造计划',
    bg: '#14532D',
    summary: '从灯光、理线到屏幕布局，打造零干扰桌面空间。',
  },
  {
    id: 'col-3',
    tag: '硬件评测',
    title: '随身音频与蓝牙体验',
    bg: '#7C2D12',
    summary: '对比多款随身音频设备的延迟、续航与多设备切换体验。',
  },
] as const;

const MAGAZINE_CARDS = [
  {
    id: 'mag-1',
    kicker: '深度指南',
    title: '效率工具进阶搭配手册',
    lightBg: '#EDE9FE',
    darkBg: '#2E2646',
    lightKicker: '#5B21B6',
    darkKicker: '#C4B5FD',
    summary: '系统化串联笔记、任务与自动化脚本，减少上下文切换成本。',
  },
  {
    id: 'mag-2',
    kicker: '年度精选',
    title: '2026 极简桌面好物推荐',
    lightBg: '#DCFCE7',
    darkBg: '#193529',
    lightKicker: '#166534',
    darkKicker: '#86EFAC',
    summary: '从支架、键盘到拓展坞，精选高质感实用外设清单。',
  },
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
  onSelectRecord?: (record: MockListRecord) => void;
}

function RecommendedFeedTab({
  isActive,
  onSelectItem,
  onSelectRecord,
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

  const editorialHeader = (
    <VStack gap="lg" style={styles.editorialHeader}>
      {/* 1. Hero Featured Cover Card */}
      <Pressable
        testID="home-hero-card"
        accessibilityRole="button"
        onPress={() =>
          onSelectRecord?.({
            id: 'hero-featured',
            title: '打造高效率的极简桌面工作流',
            tag: '编辑精选',
            summary:
              '从信息架构、空间照明到跨设备同步，拆解一套真正让人专注且可持续迭代的个人数字工作流。',
            meta: '编辑部 · 8 分钟阅读',
          })
        }
        style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
      >
        <View style={styles.heroOverlay}>
          <HStack justify="space-between" align="center">
            <View
              style={[
                styles.heroBadge,
                { backgroundColor: tokens.colors.primary, borderRadius: tokens.radii.full },
              ]}
            >
              <AppText variant="caption" tone="inverse" weight="700">
                编辑精选
              </AppText>
            </View>
            <AppText variant="caption" style={styles.heroMetaText}>
              深度长文 · 8 分钟
            </AppText>
          </HStack>

          <VStack gap="xs">
            <AppText variant="titleLg" style={styles.heroTitle} numberOfLines={2}>
              打造高效率的极简桌面工作流
            </AppText>
            <HStack align="center" gap="xs">
              <View style={styles.heroAuthorDot}>
                <AppText variant="caption" style={styles.heroAuthorInitial}>
                  编
                </AppText>
              </View>
              <AppText variant="caption" style={styles.heroMetaText}>
                编辑部 · 刚刚更新
              </AppText>
            </HStack>
          </VStack>
        </View>
      </Pressable>

      {/* 2. 3-Column Equal-Width Topic Cards (matches mockup, zero horizontal overflow or TabPager conflict) */}
      <HStack gap="sm" style={styles.fullRow}>
        {FEATURED_CAROUSEL.map((col) => (
          <Pressable
            key={col.id}
            accessibilityRole="button"
            onPress={() =>
              onSelectRecord?.({
                id: col.id,
                title: col.title,
                tag: col.tag,
                summary: col.summary,
                meta: '精选栏目',
              })
            }
            style={({ pressed }) => [
              styles.carouselCard,
              { backgroundColor: col.bg, borderRadius: tokens.radii.md },
              pressed && styles.pressed,
            ]}
          >
            <AppText variant="caption" style={styles.carouselTag} numberOfLines={1}>
              {col.tag}
            </AppText>
            <AppText variant="bodySm" weight="700" style={styles.carouselTitle} numberOfLines={2}>
              {col.title}
            </AppText>
          </Pressable>
        ))}
      </HStack>

      {/* 3. 2-Column Equal-Width Pastel Editorial Magazine Cards */}
      <HStack gap="sm" style={styles.fullRow}>
        {MAGAZINE_CARDS.map((card) => (
          <Pressable
            key={card.id}
            accessibilityRole="button"
            onPress={() =>
              onSelectRecord?.({
                id: card.id,
                title: card.title,
                tag: card.kicker,
                summary: card.summary,
                meta: '专题精选',
              })
            }
            style={({ pressed }) => [
              styles.magazineCard,
              {
                backgroundColor: tokens.isDark ? card.darkBg : card.lightBg,
                borderRadius: tokens.radii.lg,
              },
              pressed && styles.pressed,
            ]}
          >
            <AppText
              variant="caption"
              weight="700"
              style={{ color: tokens.isDark ? card.darkKicker : card.lightKicker }}
            >
              {card.kicker}
            </AppText>
            <AppText variant="bodyMd" weight="700" numberOfLines={2}>
              {card.title}
            </AppText>
          </Pressable>
        ))}
      </HStack>
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
      <View style={[styles.flex, { backgroundColor: tokens.colors.surface }]}>
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
          ListHeaderComponent={editorialHeader}
          contentContainerStyle={styles.feedListContent}
          ListEmptyComponent={
            <EmptyState title={t('home.emptyTitle')} description={t('home.emptyDescription')} />
          }
          ItemSeparatorComponent={() => (
            <View style={[styles.hairlineDivider, { backgroundColor: tokens.colors.border }]} />
          )}
          renderItem={({ item }) => (
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
                    <AppText variant="caption" tone="brand" weight="600">
                      {item.category}
                    </AppText>
                    <FeedStatusBadge status={item.status} />
                  </HStack>
                </VStack>
                <AppImage uri={item.coverUrl} width={92} height={68} />
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
      </View>
    </PageTemplate>
  );
}

interface AsyncHomeSubTabProps {
  channelKey: 'following' | 'trending';
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
  onOpenWebView?: () => void;
}

function AsyncHomeSubTab({
  channelKey,
  isActive,
  onSelectRecord,
  onOpenWebView,
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

  const listHeader =
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
    );

  return (
    <View
      testID={`home-tab-${channelKey}`}
      style={[styles.flex, { backgroundColor: tokens.colors.surface }]}
    >
      <ListTemplate
        data={feed.items}
        keyExtractor={(item) => item.id}
        status={status}
        isActive={isActive}
        listHeader={listHeader}
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
                <HStack align="center" gap="sm">
                  <AppText variant="caption" tone="brand" weight="600">
                    {entry.tag}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    · {entry.meta}
                  </AppText>
                </HStack>
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
  onOpenWebView,
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
              <Ionicons name="search-outline" size={21} color={tokens.colors.textPrimary} />
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
            return (
              <RecommendedFeedTab
                isActive={isActive}
                onSelectItem={onSelectItem}
                onSelectRecord={onSelectRecord}
              />
            );
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
              onOpenWebView={onOpenWebView}
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
  editorialHeader: {
    paddingTop: 8,
    paddingBottom: 14,
  },
  heroCard: {
    height: 184,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#231D1A',
  },
  heroOverlay: {
    flex: 1,
    padding: 18,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  heroTitle: {
    color: '#FFFFFF',
  },
  heroMetaText: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  heroAuthorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAuthorInitial: {
    color: '#FFFFFF',
    fontSize: 10,
  },
  fullRow: {
    width: '100%',
  },
  carouselCard: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 86,
    padding: 12,
    justifyContent: 'space-between',
  },
  carouselTag: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  carouselTitle: {
    color: '#FFFFFF',
  },
  magazineCard: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 104,
    padding: 14,
    justifyContent: 'space-between',
  },
  feedListContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  errorBanner: {
    marginHorizontal: 16,
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
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

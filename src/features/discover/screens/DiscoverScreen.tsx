import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { BarcodeScannerView } from '@/core/capabilities/camera';
import { useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  BottomSheetModal,
  ListTemplate,
  Screen,
  TabPager,
  TopTabs,
  type PageStatus,
  type TopTabItem,
} from '@/core/ui';
import { QuickMusicBar, useMockPaginatedFeed, type MockListRecord } from '@/shared';
import { DiscoverListRow } from '../components/DiscoverListRow';
import { DiscoverPlazaHeader } from '../components/DiscoverPlazaHeader';

export interface DiscoverScreenProps {
  onSelectRecord?: (record: MockListRecord) => void;
  onOpenSearch?: () => void;
  onOpenWebView?: () => void;
}

const DISCOVER_TABS: readonly TopTabItem[] = [
  { key: 'categories', label: '广场' },
  { key: 'rankings', label: '榜单' },
  { key: 'topics', label: '专题' },
];

const extractRecordKey = (item: MockListRecord): string => item.id;

function DiscoverSubTab({
  tabKey,
  isActive,
  onSelectRecord,
  onOpenScanner,
  onOpenWebView,
}: {
  tabKey: string;
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
  onOpenScanner: () => void;
  onOpenWebView?: () => void;
}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const feed = useMockPaginatedFeed(tabKey);
  const { refetch, fetchNextPage } = feed;

  const status: PageStatus =
    feed.isLoading && feed.items.length === 0
      ? 'loading'
      : feed.error && feed.items.length === 0
        ? 'error'
        : feed.items.length === 0
          ? 'empty'
          : 'ready';

  const listHeader = useMemo(() => {
    if (tabKey === 'categories') {
      return (
        <DiscoverPlazaHeader
          onSelectRecord={onSelectRecord}
          onOpenScanner={onOpenScanner}
          onOpenWebView={onOpenWebView}
        />
      );
    }
    if (tabKey === 'rankings') {
      return <QuickMusicBar />;
    }
    return null;
  }, [onOpenScanner, onOpenWebView, onSelectRecord, tabKey]);

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const isTopicTab = tabKey === 'topics';
  const renderRecord = useCallback(
    (item: MockListRecord) => (
      <DiscoverListRow item={item} isTopicTab={isTopicTab} onSelectRecord={onSelectRecord} />
    ),
    [isTopicTab, onSelectRecord],
  );

  return (
    <View
      testID={`discover-tab-${tabKey}`}
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
        renderItem={renderRecord}
      />
    </View>
  );
}

export function DiscoverScreen({
  onSelectRecord,
  onOpenSearch,
  onOpenWebView,
}: DiscoverScreenProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const toast = useToast();
  const [activeIndex, setActiveIndex] = useState(0);
  const [scannerVisible, setScannerVisible] = useState(false);
  const scrollProgress = useSharedValue(0);

  return (
    <Screen statusBarBackgroundColor={tokens.colors.surface}>
      <TopTabs
        tabs={DISCOVER_TABS}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
        rightSlot={
          onOpenSearch ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="搜索"
              testID="discover-search-button"
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
        pageCount={DISCOVER_TABS.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={(index, isActive) => (
          <DiscoverSubTab
            tabKey={DISCOVER_TABS[index]?.key ?? 'categories'}
            isActive={isActive}
            onSelectRecord={onSelectRecord}
            onOpenScanner={() => setScannerVisible(true)}
            onOpenWebView={onOpenWebView}
          />
        )}
      />
      <BottomSheetModal
        visible={scannerVisible}
        title="扫一扫"
        onClose={() => setScannerVisible(false)}
      >
        <BarcodeScannerView
          rationale={{
            title: '相机权限说明',
            description: '用于扫描二维码或条形码。',
          }}
          onScanned={(payload) => {
            setScannerVisible(false);
            toast.show({ message: `扫码结果：${payload.data}`, tone: 'success' });
          }}
        />
      </BottomSheetModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

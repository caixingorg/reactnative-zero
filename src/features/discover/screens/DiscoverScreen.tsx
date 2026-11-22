import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarcodeScannerView, useCameraCapability } from '@/core/capabilities/camera';
import { useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppText,
  HStack,
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

const SCANNER_RATIONALE = {
  title: '相机权限说明',
  description: '用于扫描二维码或条形码。',
} as const;

export function DiscoverScreen({
  onSelectRecord,
  onOpenSearch,
  onOpenWebView,
}: DiscoverScreenProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const camera = useCameraCapability();
  const toast = useToast();
  const [activeIndex, setActiveIndex] = useState(0);
  const [scannerVisible, setScannerVisible] = useState(false);
  const scrollProgress = useSharedValue(0);

  // 原因：iOS 上不能同时叠加权限说明 Modal 与扫码 BottomSheetModal，必须先完成权限授权再打开扫码弹层
  const handleOpenScanner = async (): Promise<void> => {
    const granted = await camera.requestScannerAccess(SCANNER_RATIONALE);
    if (granted) {
      setScannerVisible(true);
    }
  };

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
            onOpenScanner={() => {
              void handleOpenScanner();
            }}
            onOpenWebView={onOpenWebView}
          />
        )}
      />
      <Modal
        visible={scannerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setScannerVisible(false)}
      >
        <View style={styles.scannerRoot}>
          {scannerVisible ? (
            <BarcodeScannerView
              fullScreen
              rationale={SCANNER_RATIONALE}
              onScanned={(payload) => {
                setScannerVisible(false);
                toast.show({ message: `扫码结果：${payload.data}`, tone: 'success' });
              }}
            />
          ) : null}

          {/* 顶部悬浮导航栏 */}
          <HStack
            align="center"
            justify="space-between"
            style={[styles.scannerTopBar, { paddingTop: Math.max(insets.top, 16) + 8 }]}
          >
            <Pressable
              testID="scanner-close-btn"
              accessibilityRole="button"
              accessibilityLabel="关闭扫一扫"
              onPress={() => setScannerVisible(false)}
              style={({ pressed }) => [styles.scannerCloseBtn, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
            <AppText variant="titleMd" weight="700" style={styles.scannerTitle}>
              扫一扫
            </AppText>
            <View style={styles.scannerSpacer} />
          </HStack>

          {/* 中央取景框视觉引导 */}
          <View pointerEvents="none" style={styles.scannerOverlay}>
            <View style={styles.reticleBox}>
              <View
                style={[styles.corner, styles.cornerTL, { borderColor: tokens.colors.primary }]}
              />
              <View
                style={[styles.corner, styles.cornerTR, { borderColor: tokens.colors.primary }]}
              />
              <View
                style={[styles.corner, styles.cornerBL, { borderColor: tokens.colors.primary }]}
              />
              <View
                style={[styles.corner, styles.cornerBR, { borderColor: tokens.colors.primary }]}
              />
            </View>
            <AppText variant="bodySm" style={styles.scannerHint}>
              将二维码 / 条形码放入框内，即可自动扫描
            </AppText>
          </View>
        </View>
      </Modal>
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
  pressed: {
    opacity: 0.72,
  },
  scannerRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  scannerCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerTitle: {
    color: '#FFFFFF',
  },
  scannerSpacer: {
    width: 38,
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  reticleBox: {
    width: 240,
    height: 240,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 6,
  },
  scannerHint: {
    color: 'rgba(255,255,255,0.88)',
  },
});

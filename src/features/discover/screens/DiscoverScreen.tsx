import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { BarcodeScannerView } from '@/core/capabilities/camera';
import { useFilesCapability } from '@/core/capabilities/files';
import { useLocationCapability } from '@/core/capabilities/location';
import { useMediaCapability } from '@/core/capabilities/media';
import { useMusicCapability } from '@/core/capabilities/music';
import { useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppText,
  BottomSheetModal,
  HStack,
  ListTemplate,
  Screen,
  TabPager,
  TopTabs,
  VStack,
  type PageStatus,
  type TopTabItem,
} from '@/core/ui';
import { QuickMusicBar, useMockPaginatedFeed, type MockListRecord } from '@/shared';

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
  const music = useMusicCapability();
  const media = useMediaCapability();
  const location = useLocationCapability();
  const files = useFilesCapability();
  const toast = useToast();
  const feed = useMockPaginatedFeed(tabKey);

  const status: PageStatus =
    feed.isLoading && feed.items.length === 0
      ? 'loading'
      : feed.error && feed.items.length === 0
        ? 'error'
        : feed.items.length === 0
          ? 'empty'
          : 'ready';

  const isPlaying = music.state.status === 'playing';

  const handleMusicAction = async (): Promise<void> => {
    if (!music.state.track) {
      const asset = await files.pickDocument({ types: ['audio/*'] });
      if (!asset) {
        return;
      }
      await music.player.loadAndPlay({ uri: asset.uri, name: asset.name });
      toast.show({ message: `正在播放：${asset.name}`, tone: 'info' });
      return;
    }
    music.player.togglePlayPause();
  };

  const bentoPlazaHeader = (
    <VStack testID="discover-tools-grid" gap="sm" style={styles.bentoSection}>
      {/* Row 1: Asymmetric Bento — Left Dark Vinyl Music Card + Right 2 Pastel Tool Cards */}
      <HStack gap="sm" style={styles.bentoTopRow}>
        <Pressable
          testID="discover-tool-music"
          accessibilityRole="button"
          onPress={() => {
            void handleMusicAction();
          }}
          style={({ pressed }) => [styles.musicBentoCard, pressed && styles.pressed]}
        >
          <AppText variant="bodySm" weight="700" style={styles.musicBentoTitle} numberOfLines={1}>
            {music.state.track?.name ?? '本地音乐随身听'}
          </AppText>

          <View style={styles.vinylOuter}>
            <View style={styles.vinylMiddle}>
              <View style={styles.vinylCore} />
            </View>
          </View>

          <View style={styles.playPill}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#18181B" />
          </View>
        </Pressable>

        <VStack flex={1} gap="sm">
          <Pressable
            testID="discover-tool-scan"
            accessibilityRole="button"
            onPress={onOpenScanner}
            style={({ pressed }) => [
              styles.pastelBentoCard,
              { backgroundColor: tokens.isDark ? '#1E3A5F' : '#DBEAFE' },
              pressed && styles.pressed,
            ]}
          >
            <AppText
              variant="bodySm"
              weight="700"
              style={{ color: tokens.isDark ? '#BFDBFE' : '#1E3A8A' }}
            >
              扫一扫
            </AppText>
            <Ionicons name="scan-outline" size={28} color={tokens.isDark ? '#93C5FD' : '#2563EB'} />
          </Pressable>

          <Pressable
            testID="discover-tool-location"
            accessibilityRole="button"
            onPress={() => {
              void location
                .getCurrentPositionWithPermission({
                  title: '定位权限说明',
                  description: '用于获取您当前所在位置完成打卡。',
                })
                .then((pos) => {
                  if (pos) {
                    toast.show({
                      message: `附近打卡：${pos.latitude.toFixed(2)}, ${pos.longitude.toFixed(2)}`,
                      tone: 'success',
                    });
                  }
                });
            }}
            style={({ pressed }) => [
              styles.pastelBentoCard,
              { backgroundColor: tokens.isDark ? '#4C1D24' : '#FFE4E6' },
              pressed && styles.pressed,
            ]}
          >
            <AppText
              variant="bodySm"
              weight="700"
              style={{ color: tokens.isDark ? '#FECDD3' : '#9F1239' }}
            >
              附近打卡
            </AppText>
            <Ionicons
              name="location-outline"
              size={28}
              color={tokens.isDark ? '#FDA4AF' : '#E11D48'}
            />
          </Pressable>
        </VStack>
      </HStack>

      {/* Row 2: 3 Clean Utility Pills */}
      <HStack gap="sm">
        <Pressable
          testID="discover-tool-photo"
          accessibilityRole="button"
          onPress={() => {
            void media
              .pickImageWithPermission({
                title: '相册权限说明',
                description: '用于从手机相册挑选图片上传。',
              })
              .then((asset) => {
                if (asset) {
                  toast.show({ message: '已选取相册图片', tone: 'success' });
                }
              });
          }}
          style={({ pressed }) => [
            styles.utilityPill,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="cloud-upload-outline" size={20} color={tokens.colors.textPrimary} />
          <AppText variant="caption" weight="600">
            图库上传
          </AppText>
        </Pressable>

        <Pressable
          testID="discover-tool-files"
          accessibilityRole="button"
          onPress={() => {
            void files.pickDocument().then((doc) => {
              if (doc) {
                toast.show({ message: `已选文件：${doc.name}`, tone: 'info' });
              }
            });
          }}
          style={({ pressed }) => [
            styles.utilityPill,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="document-outline" size={20} color={tokens.colors.textPrimary} />
          <AppText variant="caption" weight="600">
            文件快传
          </AppText>
        </Pressable>

        <Pressable
          testID="discover-tool-h5"
          accessibilityRole="button"
          onPress={() => {
            if (onOpenWebView) {
              onOpenWebView();
            } else {
              toast.show({ message: '请在完整路由环境中打开 H5 容器', tone: 'info' });
            }
          }}
          style={({ pressed }) => [
            styles.utilityPill,
            { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.md },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="globe-outline" size={20} color={tokens.colors.textPrimary} />
          <AppText variant="caption" weight="600">
            H5 轻应用
          </AppText>
        </Pressable>
      </HStack>

      {/* Row 3: Weekly Editorial Poster Card */}
      <Pressable
        testID="discover-weekly-poster"
        accessibilityRole="button"
        onPress={() =>
          onSelectRecord?.({
            id: 'weekly-poster',
            title: '本周专题画报 · 探索数字生活新方式',
            tag: '专题画报',
            summary: '精选本周最具启发性的产品评测、自动化工作流与跨端工程实践。',
            meta: '共 12 篇精选',
          })
        }
        style={({ pressed }) => [styles.posterCard, pressed && styles.pressed]}
      >
        <VStack flex={1} justify="center" align="center" gap="xs">
          <AppText variant="titleLg" style={styles.posterTitle}>
            本周专题画报
          </AppText>
          <AppText variant="caption" style={styles.posterSub}>
            探索数字生活新方式 · 共 12 篇精选
          </AppText>
        </VStack>
      </Pressable>
    </VStack>
  );

  const listHeader =
    tabKey === 'categories' ? bentoPlazaHeader : tabKey === 'rankings' ? <QuickMusicBar /> : null;

  return (
    <View
      testID={`discover-tab-${tabKey}`}
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
        renderItem={(item) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelectRecord?.(item)}
            style={({ pressed }) => [
              tabKey === 'topics'
                ? [
                    styles.topicPoster,
                    { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.lg },
                  ]
                : [styles.editorialRow, { borderBottomColor: tokens.colors.border }],
              pressed && styles.pressed,
            ]}
          >
            {tabKey === 'topics' ? (
              <VStack gap="xs">
                <HStack justify="space-between" align="center">
                  <AppText variant="caption" tone="brand" weight="700">
                    {item.tag}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {item.meta}
                  </AppText>
                </HStack>
                <AppText variant="titleMd">{item.title}</AppText>
                <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                  {item.summary}
                </AppText>
              </VStack>
            ) : (
              <HStack gap="md" align="flex-start">
                {item.rank !== undefined ? (
                  <AppText
                    variant="titleMd"
                    tone={item.rank <= 3 ? 'brand' : 'secondary'}
                    weight="700"
                    style={styles.rankNumber}
                  >
                    {String(item.rank).padStart(2, '0')}
                  </AppText>
                ) : null}
                <VStack flex={1} gap="xs">
                  <AppText variant="bodyMd" weight="700" numberOfLines={1}>
                    {item.title}
                  </AppText>
                  <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                    {item.summary}
                  </AppText>
                  <HStack gap="sm">
                    <AppText variant="caption" tone="brand" weight="600">
                      {item.tag}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      · {item.meta}
                    </AppText>
                  </HStack>
                </VStack>
              </HStack>
            )}
          </Pressable>
        )}
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
    <Screen>
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
  bentoSection: {
    marginBottom: 14,
  },
  bentoTopRow: {
    height: 184,
  },
  musicBentoCard: {
    flex: 1.25,
    borderRadius: 20,
    backgroundColor: '#18181B',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  musicBentoTitle: {
    color: '#FFFFFF',
  },
  vinylOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylMiddle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylCore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D7191A',
  },
  playPill: {
    paddingHorizontal: 22,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastelBentoCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  utilityPill: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  posterCard: {
    height: 136,
    borderRadius: 20,
    backgroundColor: '#241B19',
    padding: 18,
  },
  posterTitle: {
    color: '#FFFFFF',
  },
  posterSub: {
    color: 'rgba(255, 255, 255, 0.78)',
  },
  topicPoster: {
    padding: 16,
    marginBottom: 4,
  },
  editorialRow: {
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

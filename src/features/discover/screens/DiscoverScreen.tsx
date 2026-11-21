import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { BarcodeScannerView, useCameraCapability } from '@/core/capabilities/camera';
import { useFilesCapability } from '@/core/capabilities/files';
import { useLocationCapability } from '@/core/capabilities/location';
import { useMediaCapability } from '@/core/capabilities/media';
import { useDrawer, useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppText,
  BottomSheetModal,
  DrawerTriggerButton,
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

interface ToolTile {
  key: string;
  label: string;
  caption: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

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
  const camera = useCameraCapability();
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

  const tools: readonly ToolTile[] = [
    {
      key: 'scan',
      label: '扫一扫',
      caption: '条码 / 二维码',
      icon: 'scan-outline',
      onPress: onOpenScanner,
    },
    {
      key: 'camera',
      label: '拍照打卡',
      caption: '原生相机采集',
      icon: 'camera-outline',
      onPress: () => {
        void camera
          .capturePhotoWithPermission({
            title: '相机权限说明',
            description: '用于拍摄照片完成现场打卡。',
          })
          .then((photo) => {
            if (photo) {
              toast.show({ message: '已拍摄照片', tone: 'success' });
            }
          });
      },
    },
    {
      key: 'photo',
      label: '相册选图',
      caption: '本地图片选取',
      icon: 'images-outline',
      onPress: () => {
        void media
          .pickImageWithPermission({
            title: '相册权限说明',
            description: '用于从相册挑选素材。',
          })
          .then((asset) => {
            if (asset) {
              toast.show({ message: '已选取相册图片', tone: 'success' });
            }
          });
      },
    },
    {
      key: 'location',
      label: '附近定位',
      caption: '获取当前坐标',
      icon: 'location-outline',
      onPress: () => {
        void location
          .getCurrentPositionWithPermission({
            title: '定位权限说明',
            description: '用于获取您当前所在位置。',
          })
          .then((pos) => {
            if (pos) {
              toast.show({
                message: `定位成功：${pos.latitude.toFixed(2)}, ${pos.longitude.toFixed(2)}`,
                tone: 'success',
              });
            }
          });
      },
    },
    {
      key: 'files',
      label: '文件快传',
      caption: '选择并分享文件',
      icon: 'document-text-outline',
      onPress: () => {
        void files.pickDocument().then((doc) => {
          if (doc) {
            toast.show({ message: `已选文件：${doc.name}`, tone: 'info' });
          }
        });
      },
    },
    {
      key: 'h5',
      label: 'H5 轻应用',
      caption: '安全混合容器',
      icon: 'globe-outline',
      onPress: () => {
        if (onOpenWebView) {
          onOpenWebView();
        } else {
          toast.show({ message: '请在完整路由环境中打开 H5 容器', tone: 'info' });
        }
      },
    },
  ];

  const listHeader =
    tabKey === 'categories' ? (
      <View testID="discover-tools-grid" style={styles.toolsGrid}>
        {tools.map((tool) => (
          <Pressable
            key={tool.key}
            testID={`discover-tool-${tool.key}`}
            accessibilityRole="button"
            onPress={tool.onPress}
            style={({ pressed }) => [
              styles.toolCard,
              {
                backgroundColor: tokens.colors.surface,
                borderColor: tokens.colors.border,
                borderRadius: tokens.radii.lg,
              },
              pressed && styles.pressed,
            ]}
          >
            <HStack align="center" gap="sm">
              <View
                style={[
                  styles.toolIconWrap,
                  { backgroundColor: tokens.colors.primarySoft, borderRadius: tokens.radii.md },
                ]}
              >
                <Ionicons name={tool.icon} size={20} color={tokens.colors.primary} />
              </View>
              <VStack flex={1}>
                <AppText variant="bodySm" weight="600" numberOfLines={1}>
                  {tool.label}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {tool.caption}
                </AppText>
              </VStack>
            </HStack>
          </Pressable>
        ))}
      </View>
    ) : tabKey === 'rankings' ? (
      <QuickMusicBar />
    ) : null;

  return (
    <View testID={`discover-tab-${tabKey}`} style={styles.flex}>
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
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            {tabKey === 'topics' ? (
              <VStack bg="surface" radius="lg" bordered style={styles.topicCard}>
                <View style={[styles.topicBanner, { backgroundColor: tokens.colors.primarySoft }]}>
                  <HStack justify="space-between" align="center">
                    <AppText variant="caption" tone="brand" weight="700">
                      {item.tag}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      {item.meta}
                    </AppText>
                  </HStack>
                </View>
                <VStack p="md" gap="xs">
                  <AppText variant="titleMd">{item.title}</AppText>
                  <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                    {item.summary}
                  </AppText>
                </VStack>
              </VStack>
            ) : (
              <HStack p="md" gap="md" bg="surface" radius="lg" bordered align="center">
                {item.rank !== undefined ? (
                  <View
                    style={[
                      styles.rankBadge,
                      {
                        backgroundColor:
                          item.rank <= 3 ? tokens.colors.primarySoft : tokens.colors.surfaceMuted,
                        borderRadius: tokens.radii.md,
                      },
                    ]}
                  >
                    <AppText
                      variant="bodyMd"
                      tone={item.rank <= 3 ? 'brand' : 'secondary'}
                      weight="700"
                    >
                      #{item.rank}
                    </AppText>
                  </View>
                ) : null}
                <VStack flex={1} gap="xs">
                  <HStack justify="space-between" align="center">
                    <AppText variant="caption" tone="brand" weight="600">
                      {item.tag}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      {item.meta}
                    </AppText>
                  </HStack>
                  <AppText variant="titleMd" numberOfLines={1}>
                    {item.title}
                  </AppText>
                  <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                    {item.summary}
                  </AppText>
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
  const drawer = useDrawer();
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
        leftSlot={<DrawerTriggerButton testID="discover-drawer-button" onPress={drawer.open} />}
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
              <Ionicons name="search-outline" size={22} color={tokens.colors.textPrimary} />
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
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  toolCard: {
    width: '48%',
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toolIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicCard: {
    overflow: 'hidden',
  },
  topicBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rankBadge: {
    width: 36,
    height: 36,
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

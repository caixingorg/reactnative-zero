import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useFilesCapability } from '@/core/capabilities/files';
import { useMediaCapability } from '@/core/capabilities/media';
import { useAuthSession, useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
  AppImage,
  AppText,
  HStack,
  ListTemplate,
  Screen,
  TabPager,
  TopTabs,
  VStack,
  type PageStatus,
  type TopTabItem,
} from '@/core/ui';
import { QuickComposerCard, useMockPaginatedFeed, type MockListRecord } from '@/shared';

export interface ProfileScreenProps {
  onOpenSettings?: () => void;
  onSelectRecord?: (record: MockListRecord) => void;
}

const PROFILE_TABS: readonly TopTabItem[] = [
  { key: 'favorites', label: '收藏' },
  { key: 'history', label: '历史' },
  { key: 'activity', label: '动态' },
];

function ProfileSubTab({
  tabKey,
  isActive,
  onSelectRecord,
}: {
  tabKey: string;
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const user = useAuthSession((state) => state.user);
  const files = useFilesCapability();
  const media = useMediaCapability();
  const toast = useToast();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [publishedItems, setPublishedItems] = useState<readonly MockListRecord[]>([]);
  const feed = useMockPaginatedFeed(tabKey);
  const combinedItems = React.useMemo(
    () => (publishedItems.length > 0 ? [...publishedItems, ...feed.items] : feed.items),
    [feed.items, publishedItems],
  );

  const status: PageStatus =
    feed.isLoading && combinedItems.length === 0
      ? 'loading'
      : feed.error && combinedItems.length === 0
        ? 'error'
        : combinedItems.length === 0
          ? 'empty'
          : 'ready';

  const handleExportFavorites = async (): Promise<void> => {
    const content = feed.items.map((item, idx) => `${idx + 1}. ${item.title}`).join('\n');
    const shared = await files.writeTextFileAndShare(
      'favorites-export.txt',
      content || '暂无收藏记录',
    );
    if (shared) {
      toast.show({ message: '已生成收藏清单供系统分享', tone: 'success' });
    }
  };

  const handlePickAvatar = async (): Promise<void> => {
    const picked = await media.pickImageWithPermission({
      title: '相册权限说明',
      description: '用于挑选本地图片更换个人头像。',
    });
    if (picked) {
      setAvatarUri(picked.uri);
      toast.show({ message: '头像已更新（本地预览）', tone: 'success' });
    }
  };

  const listHeader =
    tabKey === 'favorites' && files.enabled ? (
      <HStack
        p="md"
        bg="surface"
        radius="lg"
        bordered
        align="center"
        justify="space-between"
        style={styles.headerBlock}
      >
        <VStack>
          <AppText variant="bodySm" weight="600">
            我的收藏清单
          </AppText>
          <AppText variant="caption" tone="secondary">
            支持一键导出为文本并调用系统分享
          </AppText>
        </VStack>
        <Pressable
          testID="profile-export-favorites-btn"
          accessibilityRole="button"
          onPress={() => {
            void handleExportFavorites();
          }}
          style={[
            styles.pillBtn,
            { backgroundColor: tokens.colors.primarySoft, borderRadius: tokens.radii.full },
          ]}
        >
          <AppText variant="caption" tone="brand" weight="600">
            导出分享
          </AppText>
        </Pressable>
      </HStack>
    ) : tabKey === 'activity' ? (
      <VStack gap="sm" style={styles.headerBlock}>
        <HStack p="md" gap="md" bg="surface" radius="lg" bordered align="center">
          <Pressable
            testID="profile-avatar-btn"
            accessibilityRole="button"
            accessibilityLabel="更换头像"
            onPress={() => {
              void handlePickAvatar();
            }}
          >
            {avatarUri ? (
              <AppImage uri={avatarUri} width={48} height={48} />
            ) : (
              <View
                style={[
                  styles.avatarFallback,
                  { backgroundColor: tokens.colors.primary, borderRadius: tokens.radii.full },
                ]}
              >
                <AppText variant="titleMd" tone="inverse" weight="700">
                  {(user?.displayName ?? '我').slice(0, 1).toUpperCase()}
                </AppText>
              </View>
            )}
          </Pressable>
          <VStack flex={1} gap="xs">
            <AppText variant="titleMd">{user?.displayName ?? '未登录用户'}</AppText>
            <AppText variant="caption" tone="secondary">
              点击头像可从相册更换 · 下方支持图文动态发布
            </AppText>
          </VStack>
        </HStack>
        <QuickComposerCard
          onPublished={(note) => {
            setPublishedItems((prev) => [
              {
                id: `activity-pub-${prev.length + 1}`,
                title: `我的最新动态 · ${note}`,
                tag: '个人动态',
                summary: `由 ${user?.displayName ?? '当前用户'} 通过快捷发布条发布（${note}）。`,
                meta: '刚刚',
              },
              ...prev,
            ]);
          }}
        />
      </VStack>
    ) : null;

  return (
    <View testID={`profile-tab-${tabKey}`} style={styles.flex}>
      <ListTemplate
        data={combinedItems}
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
            <VStack p="md" gap="xs" bg="surface" radius="lg" bordered>
              <HStack justify="space-between" align="center">
                <AppText variant="caption" tone="brand" weight="600">
                  {item.tag}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {item.meta}
                </AppText>
              </HStack>
              <AppText variant="bodyMd" weight="600" numberOfLines={2}>
                {item.title}
              </AppText>
              <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
                {item.summary}
              </AppText>
            </VStack>
          </Pressable>
        )}
      />
    </View>
  );
}

export function ProfileScreen({
  onOpenSettings,
  onSelectRecord,
}: ProfileScreenProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);

  return (
    <Screen statusBarBackgroundColor={tokens.colors.surface}>
      <TopTabs
        tabs={PROFILE_TABS}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
        rightSlot={
          onOpenSettings ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="设置"
              testID="profile-settings-button"
              onPress={onOpenSettings}
              hitSlop={8}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="settings-outline" size={22} color={tokens.colors.textPrimary} />
            </Pressable>
          ) : undefined
        }
      />
      <TabPager
        pageCount={PROFILE_TABS.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={(index, isActive) => (
          <ProfileSubTab
            tabKey={PROFILE_TABS[index]?.key ?? 'favorites'}
            isActive={isActive}
            onSelectRecord={onSelectRecord}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerBlock: {
    marginBottom: 12,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

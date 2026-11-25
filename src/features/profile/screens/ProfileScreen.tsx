import Ionicons from '@expo/vector-icons/Ionicons';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const PROFILE_TAB_KEYS = ['favorites', 'history', 'activity'] as const;

const extractProfileKey = (item: MockListRecord): string => item.id;

interface ProfileListRowProps {
  item: MockListRecord;
  onSelectRecord?: (record: MockListRecord) => void;
}

const ProfileListRow = memo(function ProfileListRow({
  item,
  onSelectRecord,
}: ProfileListRowProps): React.JSX.Element {
  const handlePress = useCallback(() => {
    onSelectRecord?.(item);
  }, [item, onSelectRecord]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
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
  );
});

const ProfileSubTab = memo(function ProfileSubTab({
  tabKey,
  isActive,
  onSelectRecord,
}: {
  tabKey: string;
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const user = useAuthSession((state) => state.user);
  const files = useFilesCapability();
  const media = useMediaCapability();
  const toast = useToast();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [publishedItems, setPublishedItems] = useState<readonly MockListRecord[]>([]);
  const feed = useMockPaginatedFeed(tabKey);
  const combinedItems = useMemo(
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

  const handleExportFavorites = useCallback(async (): Promise<void> => {
    const content = feed.items.map((item, idx) => `${idx + 1}. ${item.title}`).join('\n');
    const shared = await files.writeTextFileAndShare(
      'favorites-export.txt',
      content || t('profile.favoritesEmpty'),
    );
    if (shared) {
      toast.show({ message: t('profile.favoritesExported'), tone: 'success' });
    }
  }, [feed.items, files, t, toast]);

  const handlePickAvatar = useCallback(async (): Promise<void> => {
    const picked = await media.pickImageWithPermission({
      title: t('profile.avatarRationaleTitle'),
      description: t('profile.avatarRationaleDesc'),
    });
    if (picked) {
      setAvatarUri(picked.uri);
      toast.show({ message: t('profile.avatarUpdated'), tone: 'success' });
    }
  }, [media, t, toast]);

  const handleRefresh = useCallback(() => {
    void feed.refetch();
  }, [feed]);

  const handleLoadMore = useCallback(() => {
    void feed.fetchNextPage();
  }, [feed]);

  const renderItem = useCallback(
    (item: MockListRecord) => <ProfileListRow item={item} onSelectRecord={onSelectRecord} />,
    [onSelectRecord],
  );

  const listHeader = useMemo(
    () =>
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
              {t('profile.favoritesTitle')}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {t('profile.favoritesSubtitle')}
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
              {t('profile.exportShareButton')}
            </AppText>
          </Pressable>
        </HStack>
      ) : tabKey === 'activity' ? (
        <VStack gap="sm" style={styles.headerBlock}>
          <HStack p="md" gap="md" bg="surface" radius="lg" bordered align="center">
            <Pressable
              testID="profile-avatar-btn"
              accessibilityRole="button"
              accessibilityLabel={t('profile.avatarLabel')}
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
                    {(user?.displayName ?? t('profile.avatarFallbackChar'))
                      .slice(0, 1)
                      .toUpperCase()}
                  </AppText>
                </View>
              )}
            </Pressable>
            <VStack flex={1} gap="xs">
              <AppText variant="titleMd">{user?.displayName ?? t('profile.guestUser')}</AppText>
              <AppText variant="caption" tone="secondary">
                {t('profile.avatarHint')}
              </AppText>
            </VStack>
          </HStack>
          <QuickComposerCard
            onPublished={(note) => {
              setPublishedItems((prev) => [
                {
                  id: `activity-pub-${prev.length + 1}`,
                  title: t('profile.activityTitle', { note }),
                  tag: t('profile.activityTag'),
                  summary: t('profile.activitySummary', {
                    author: user?.displayName ?? t('profile.currentUser'),
                    note,
                  }),
                  meta: t('profile.justNow'),
                },
                ...prev,
              ]);
            }}
          />
        </VStack>
      ) : null,
    [
      avatarUri,
      files.enabled,
      handleExportFavorites,
      handlePickAvatar,
      t,
      tabKey,
      tokens.colors.primary,
      tokens.colors.primarySoft,
      tokens.radii.full,
      user?.displayName,
    ],
  );

  return (
    <View testID={`profile-tab-${tabKey}`} style={styles.flex}>
      <ListTemplate
        data={combinedItems}
        keyExtractor={extractProfileKey}
        status={status}
        isActive={isActive}
        listHeader={listHeader}
        refreshing={feed.isRefetching}
        onRefresh={handleRefresh}
        hasNextPage={feed.hasNextPage}
        isFetchingNextPage={feed.isFetchingNextPage}
        onLoadMore={handleLoadMore}
        renderItem={renderItem}
      />
    </View>
  );
});

export function ProfileScreen({
  onOpenSettings,
  onSelectRecord,
}: ProfileScreenProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);

  const tabs: readonly TopTabItem[] = useMemo(
    () => [
      { key: 'favorites', label: t('profile.tabFavorites') },
      { key: 'history', label: t('profile.tabHistory') },
      { key: 'activity', label: t('profile.tabActivity') },
    ],
    [t],
  );

  const renderPage = useCallback(
    (index: number, isActive: boolean) => (
      <ProfileSubTab
        tabKey={PROFILE_TAB_KEYS[index] ?? 'favorites'}
        isActive={isActive}
        onSelectRecord={onSelectRecord}
      />
    ),
    [onSelectRecord],
  );

  return (
    <Screen statusBarBackgroundColor={tokens.colors.surface}>
      <TopTabs
        tabs={tabs}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
        rightSlot={
          onOpenSettings ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.settingsLabel')}
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
        pageCount={tabs.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={renderPage}
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

import Ionicons from '@expo/vector-icons/Ionicons';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useFilesCapability } from '@/core/capabilities/files';
import { useNotificationsCapability } from '@/core/capabilities/notifications';
import { useToast } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import {
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
import { useMockPaginatedFeed, type MockListRecord } from '@/shared';
import {
  useMessagesTotalUnread,
  useMessagesUnreadStore,
  type MessageChannelKey,
} from '../messages-unread-store';

export interface MessagesScreenProps {
  onSelectRecord?: (record: MockListRecord) => void;
}

const MESSAGE_TAB_KEYS: readonly MessageChannelKey[] = ['notifications', 'interactions', 'direct'];

const extractMessageKey = (item: MockListRecord): string => item.id;

interface MessagesListRowProps {
  entry: MockListRecord;
  isUnread: boolean;
  tabKey: MessageChannelKey;
  dangerColor: string;
  fullRadius: number;
  onPressRow: (tabKey: MessageChannelKey, entry: MockListRecord, isUnread: boolean) => void;
}

const MessagesListRow = memo(function MessagesListRow({
  entry,
  isUnread,
  tabKey,
  dangerColor,
  fullRadius,
  onPressRow,
}: MessagesListRowProps): React.JSX.Element {
  const handlePress = useCallback(() => {
    onPressRow(tabKey, entry, isUnread);
  }, [entry, isUnread, onPressRow, tabKey]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <HStack p="md" gap="md" bg="surface" radius="lg" bordered align="center">
        <View
          style={[
            styles.unreadDot,
            {
              backgroundColor: isUnread ? dangerColor : 'transparent',
              borderRadius: fullRadius,
            },
          ]}
        />
        <VStack flex={1} gap="xs">
          <HStack justify="space-between" align="center" gap="sm">
            <AppText variant="bodyMd" weight="600" numberOfLines={1} style={styles.flex}>
              {entry.title}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {entry.meta}
            </AppText>
          </HStack>
          <AppText variant="bodySm" tone="secondary" numberOfLines={2}>
            {entry.summary}
          </AppText>
        </VStack>
      </HStack>
    </Pressable>
  );
});

const MessagesSubTab = memo(function MessagesSubTab({
  tabKey,
  isActive,
  onSelectRecord,
}: {
  tabKey: MessageChannelKey;
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const notifications = useNotificationsCapability();
  const files = useFilesCapability();
  const toast = useToast();
  const feed = useMockPaginatedFeed(tabKey);
  const allRead = useMessagesUnreadStore((state) => state.allRead);
  const readItemIds = useMessagesUnreadStore((state) => state.readItemIds);
  const markItemRead = useMessagesUnreadStore((state) => state.markItemRead);

  const status: PageStatus =
    feed.isLoading && feed.items.length === 0
      ? 'loading'
      : feed.error && feed.items.length === 0
        ? 'error'
        : feed.items.length === 0
          ? 'empty'
          : 'ready';

  const handleTestNotification = useCallback(async (): Promise<void> => {
    const result = await notifications.scheduleLocalNotificationWithPermission(
      {
        title: t('messages.testNotifyTitle'),
        body: t('messages.testNotifyBody'),
      },
      {
        title: t('messages.notifyRationaleTitle'),
        description: t('messages.notifyRationaleDesc'),
      },
    );
    if (result) {
      toast.show({ message: t('messages.testNotifySent'), tone: 'success' });
    }
  }, [notifications, t, toast]);

  const handleSendLocalFile = useCallback(async (): Promise<void> => {
    const doc = await files.pickDocument();
    if (doc) {
      toast.show({ message: t('messages.fileAttached', { name: doc.name }), tone: 'success' });
    }
  }, [files, t, toast]);

  const handleRefresh = useCallback(() => {
    void feed.refetch();
  }, [feed]);

  const handleLoadMore = useCallback(() => {
    void feed.fetchNextPage();
  }, [feed]);

  const handlePressRow = useCallback(
    (channel: MessageChannelKey, entry: MockListRecord, isUnread: boolean) => {
      markItemRead(channel, entry.id, isUnread);
      onSelectRecord?.(entry);
    },
    [markItemRead, onSelectRecord],
  );

  const renderItem = useCallback(
    (entry: MockListRecord) => {
      const isUnread = Boolean(entry.unread) && !allRead && !readItemIds[entry.id];
      return (
        <MessagesListRow
          entry={entry}
          isUnread={isUnread}
          tabKey={tabKey}
          dangerColor={tokens.colors.danger}
          fullRadius={tokens.radii.full}
          onPressRow={handlePressRow}
        />
      );
    },
    [allRead, handlePressRow, readItemIds, tabKey, tokens.colors.danger, tokens.radii.full],
  );

  const listHeader = useMemo(
    () =>
      tabKey === 'notifications' && notifications.enabled ? (
        <HStack
          testID="messages-notify-banner"
          p="md"
          gap="md"
          bg="surface"
          radius="lg"
          bordered
          align="center"
          justify="space-between"
          style={styles.headerBanner}
        >
          <HStack flex={1} align="center" gap="sm">
            <Ionicons name="notifications-outline" size={20} color={tokens.colors.primary} />
            <VStack flex={1}>
              <AppText variant="bodySm" weight="600">
                {t('messages.notifyBannerTitle')}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {t('messages.notifyBannerSubtitle')}
              </AppText>
            </VStack>
          </HStack>
          <Pressable
            testID="messages-send-test-notify-btn"
            accessibilityRole="button"
            onPress={() => {
              void handleTestNotification();
            }}
            style={[
              styles.actionPill,
              { backgroundColor: tokens.colors.primarySoft, borderRadius: tokens.radii.full },
            ]}
          >
            <AppText variant="caption" tone="brand" weight="600">
              {t('messages.testNotifyButton')}
            </AppText>
          </Pressable>
        </HStack>
      ) : tabKey === 'direct' && files.enabled ? (
        <Pressable
          testID="messages-send-file-btn"
          accessibilityRole="button"
          onPress={() => {
            void handleSendLocalFile();
          }}
          style={({ pressed }) => [styles.headerBanner, pressed && styles.pressed]}
        >
          <HStack
            p="md"
            gap="sm"
            bg="surface"
            radius="lg"
            bordered
            align="center"
            justify="space-between"
          >
            <HStack align="center" gap="sm">
              <Ionicons name="attach-outline" size={20} color={tokens.colors.primary} />
              <AppText variant="bodySm" weight="600">
                {t('messages.sendFileButton')}
              </AppText>
            </HStack>
            <Ionicons name="chevron-forward" size={16} color={tokens.colors.textSecondary} />
          </HStack>
        </Pressable>
      ) : null,
    [
      files.enabled,
      handleSendLocalFile,
      handleTestNotification,
      notifications.enabled,
      t,
      tabKey,
      tokens.colors.primary,
      tokens.colors.primarySoft,
      tokens.colors.textSecondary,
      tokens.radii.full,
    ],
  );

  return (
    <View testID={`messages-tab-${tabKey}`} style={styles.flex}>
      <ListTemplate
        data={feed.items}
        keyExtractor={extractMessageKey}
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

export function MessagesScreen({ onSelectRecord }: MessagesScreenProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const { tokens } = useAppTheme();
  const toast = useToast();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);
  const notificationsUnread = useMessagesUnreadStore((state) => state.unreadCounts.notifications);
  const directUnread = useMessagesUnreadStore((state) => state.unreadCounts.direct);
  const allRead = useMessagesUnreadStore((state) => state.allRead);
  const hasUnreadInteraction = useMessagesUnreadStore(
    (state) => !state.allRead && !state.readItemIds['interactions-p1-1'],
  );
  const markAllRead = useMessagesUnreadStore((state) => state.markAllRead);
  const totalUnread = useMessagesTotalUnread();

  const tabs: readonly TopTabItem[] = useMemo(
    () => [
      {
        key: 'notifications',
        label: t('messages.tabNotifications'),
        badgeCount: notificationsUnread,
      },
      { key: 'interactions', label: t('messages.tabInteractions'), showDot: hasUnreadInteraction },
      { key: 'direct', label: t('messages.tabDirect'), badgeCount: directUnread },
    ],
    [directUnread, hasUnreadInteraction, notificationsUnread, t],
  );

  const handleMarkAllRead = useCallback((): void => {
    markAllRead();
    toast.show({ message: t('messages.markAllReadSuccess'), tone: 'success' });
  }, [markAllRead, t, toast]);

  const renderPage = useCallback(
    (index: number, isActive: boolean) => (
      <MessagesSubTab
        tabKey={MESSAGE_TAB_KEYS[index] ?? 'notifications'}
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
          totalUnread > 0 || !allRead ? (
            <Pressable
              testID="messages-mark-all-read"
              accessibilityRole="button"
              accessibilityLabel={t('messages.markAllRead')}
              onPress={handleMarkAllRead}
              hitSlop={8}
              style={({ pressed }) => [styles.markReadBtn, pressed && styles.pressed]}
            >
              <Ionicons name="checkmark-done-outline" size={20} color={tokens.colors.textPrimary} />
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
  headerBanner: {
    marginBottom: 12,
  },
  actionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
  },
  markReadBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
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

export interface MessagesScreenProps {
  onSelectRecord?: (record: MockListRecord) => void;
}

const MESSAGES_TABS: readonly TopTabItem[] = [
  { key: 'notifications', label: '通知', badgeCount: 3 },
  { key: 'interactions', label: '互动', showDot: true },
  { key: 'direct', label: '私信', badgeCount: 1 },
];

function MessagesSubTab({
  tabKey,
  isActive,
  onSelectRecord,
}: {
  tabKey: string;
  isActive: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const notifications = useNotificationsCapability();
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

  const handleTestNotification = async (): Promise<void> => {
    const result = await notifications.scheduleLocalNotificationWithPermission(
      {
        title: '系统通知提醒',
        body: '这是一条本地测试推送，说明消息通知链路已正常打通。',
      },
      {
        title: '通知权限说明',
        description: '用于即时向您发送重要系统通知与互动提醒。',
      },
    );
    if (result) {
      toast.show({ message: '已发送本地测试通知', tone: 'success' });
    }
  };

  const handleSendLocalFile = async (): Promise<void> => {
    const doc = await files.pickDocument();
    if (doc) {
      toast.show({ message: `已选择附件：${doc.name}`, tone: 'success' });
    }
  };

  const listHeader =
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
              消息通知提醒
            </AppText>
            <AppText variant="caption" tone="secondary">
              可一键验证系统本地通知推送
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
            测试通知
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
              选择本地文件发送给联系人
            </AppText>
          </HStack>
          <Ionicons name="chevron-forward" size={16} color={tokens.colors.textSecondary} />
        </HStack>
      </Pressable>
    ) : null;

  return (
    <View testID={`messages-tab-${tabKey}`} style={styles.flex}>
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
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <HStack p="md" gap="md" bg="surface" radius="lg" bordered align="center">
              <View
                style={[
                  styles.unreadDot,
                  {
                    backgroundColor: entry.unread ? tokens.colors.danger : 'transparent',
                    borderRadius: tokens.radii.full,
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
        )}
      />
    </View>
  );
}

export function MessagesScreen({ onSelectRecord }: MessagesScreenProps = {}): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollProgress = useSharedValue(0);

  return (
    <Screen>
      <TopTabs
        tabs={MESSAGES_TABS}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        scrollProgress={scrollProgress}
      />
      <TabPager
        pageCount={MESSAGES_TABS.length}
        activeIndex={activeIndex}
        onIndexChange={setActiveIndex}
        scrollProgress={scrollProgress}
        renderPage={(index, isActive) => (
          <MessagesSubTab
            tabKey={MESSAGES_TABS[index]?.key ?? 'notifications'}
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
  pressed: {
    opacity: 0.72,
  },
});

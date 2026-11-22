import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppHeader, AppText, ListTemplate, Screen, VStack } from '@/core/ui';

export interface GenericListItem {
  id: string;
  title: string;
  subtitle: string;
}

export interface GenericListScreenProps {
  title?: string;
  onBack?: () => void;
  onSelectItem?: (id: string, item: GenericListItem) => void;
}

const INITIAL_ITEMS: readonly GenericListItem[] = [
  { id: 'item-1', title: '企业级移动底座四层架构规范', subtitle: '更新于 今天' },
  { id: 'item-2', title: '通用页面骨架与抽屉手势隔离', subtitle: '更新于 昨天' },
  { id: 'item-3', title: '弱网离线优先缓存策略', subtitle: '更新于 3 天前' },
];

export function GenericListScreen({
  title = '列表',
  onBack,
  onSelectItem,
}: GenericListScreenProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const [items, setItems] = useState<readonly GenericListItem[]>(INITIAL_ITEMS);
  const [hasMore, setHasMore] = useState(true);

  const handleLoadMore = (): void => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${prev.length + 1}`,
        title: `更多示例条目 #${prev.length + 1}`,
        subtitle: '刚刚加载',
      },
    ]);
    setHasMore(false);
  };

  return (
    <Screen
      edges={['top', 'bottom', 'left', 'right']}
      statusBarBackgroundColor={tokens.colors.surface}
    >
      <ListTemplate
        header={<AppHeader title={title} showBack={Boolean(onBack)} onBack={onBack} />}
        data={items}
        keyExtractor={(item) => item.id}
        hasNextPage={hasMore}
        onLoadMore={handleLoadMore}
        onRefresh={() => {
          setItems(INITIAL_ITEMS);
          setHasMore(true);
        }}
        renderItem={(item) => (
          <Pressable accessibilityRole="button" onPress={() => onSelectItem?.(item.id, item)}>
            <VStack p="md" gap="xs" bg="surface" radius="lg" bordered>
              <AppText variant="bodyMd" weight="600">
                {item.title}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {item.subtitle}
              </AppText>
            </VStack>
          </Pressable>
        )}
      />
    </Screen>
  );
}

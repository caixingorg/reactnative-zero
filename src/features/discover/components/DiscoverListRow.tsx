import React, { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, HStack, VStack } from '@/core/ui';
import type { MockListRecord } from '@/shared';

export interface DiscoverListRowProps {
  item: MockListRecord;
  isTopicTab: boolean;
  onSelectRecord?: (record: MockListRecord) => void;
}

export const DiscoverListRow = memo(function DiscoverListRow({
  item,
  isTopicTab,
  onSelectRecord,
}: DiscoverListRowProps): React.JSX.Element {
  const { tokens } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelectRecord?.(item)}
      style={({ pressed }) => [
        isTopicTab
          ? [
              styles.topicPoster,
              { backgroundColor: tokens.colors.surfaceMuted, borderRadius: tokens.radii.lg },
            ]
          : [styles.editorialRow, { borderBottomColor: tokens.colors.border }],
        pressed && styles.pressed,
      ]}
    >
      {isTopicTab ? (
        <VStack gap="xs">
          <HStack justify="space-between" align="center">
            <AppText variant="caption" tone="brand" weight="700" numberOfLines={1}>
              {item.tag}
            </AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
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
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              <AppText variant="caption" tone="brand" weight="600">
                {item.tag}
              </AppText>
              {`  ·  ${item.meta}`}
            </AppText>
          </VStack>
        </HStack>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
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
  pressed: {
    opacity: 0.72,
  },
});

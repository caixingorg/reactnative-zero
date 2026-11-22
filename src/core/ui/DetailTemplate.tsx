/**
 * @module core/ui/DetailTemplate
 * 职责：通用内容详情页模板，包含头部导航（支持标准/透明头图覆盖）、头图、标题与元信息区、正文区与底部固定操作栏（点赞/收藏/分享）。
 * 边界：仅负责版式与交互事件透传，不耦合具体数据模型或接口。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppHeader } from './AppHeader';
import { AppImage } from './AppImage';
import { AppText } from './AppText';
import { Screen } from './Screen';
import { HStack, VStack } from './Stack';

export interface DetailTemplateProps {
  headerTitle?: string;
  title: string;
  subtitle?: string;
  coverUri?: string;
  onBack?: () => void;
  liked?: boolean;
  favorited?: boolean;
  onToggleLike?: () => void;
  onToggleFavorite?: () => void;
  onShare?: () => void;
  children?: React.ReactNode;
}

export function DetailTemplate({
  headerTitle = '详情',
  title,
  subtitle,
  coverUri,
  onBack,
  liked = false,
  favorited = false,
  onToggleLike,
  onToggleFavorite,
  onShare,
  children,
}: DetailTemplateProps): React.JSX.Element {
  const { tokens } = useAppTheme();

  return (
    <Screen
      edges={['top', 'bottom', 'left', 'right']}
      statusBarBackgroundColor={tokens.colors.surface}
    >
      <AppHeader title={headerTitle} showBack={Boolean(onBack)} onBack={onBack} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
        {coverUri ? (
          <View style={styles.coverWrapper}>
            <View
              style={[
                styles.coverFrame,
                {
                  borderRadius: tokens.radii.lg,
                  backgroundColor: tokens.colors.surfaceMuted,
                },
              ]}
            >
              <AppImage uri={coverUri} height={200} style={styles.coverImage} />
            </View>
          </View>
        ) : null}

        <VStack px="lg" py="md" gap="xs">
          <AppText variant="titleLg">{title}</AppText>
          {subtitle ? (
            <AppText variant="caption" tone="secondary">
              {subtitle}
            </AppText>
          ) : null}
        </VStack>

        <VStack px="lg" gap="md">
          {children}
        </VStack>
      </ScrollView>

      <HStack
        px="lg"
        py="sm"
        justify="space-around"
        align="center"
        style={[
          styles.actionBar,
          {
            backgroundColor: tokens.colors.surface,
            borderTopColor: tokens.colors.border,
          },
        ]}
      >
        <Pressable
          testID="detail-action-like"
          accessibilityRole="button"
          accessibilityLabel="点赞"
          onPress={onToggleLike}
          style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}
        >
          <HStack align="center" gap="xs">
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={20}
              color={liked ? tokens.colors.danger : tokens.colors.textSecondary}
            />
            <AppText variant="bodySm" tone={liked ? 'danger' : 'secondary'}>
              {liked ? '已赞' : '点赞'}
            </AppText>
          </HStack>
        </Pressable>

        <Pressable
          testID="detail-action-favorite"
          accessibilityRole="button"
          accessibilityLabel="收藏"
          onPress={onToggleFavorite}
          style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}
        >
          <HStack align="center" gap="xs">
            <Ionicons
              name={favorited ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={favorited ? tokens.colors.primary : tokens.colors.textSecondary}
            />
            <AppText variant="bodySm" tone={favorited ? 'brand' : 'secondary'}>
              {favorited ? '已收藏' : '收藏'}
            </AppText>
          </HStack>
        </Pressable>

        <Pressable
          testID="detail-action-share"
          accessibilityRole="button"
          accessibilityLabel="分享"
          onPress={onShare}
          style={({ pressed }) => [styles.actionItem, pressed && styles.pressed]}
        >
          <HStack align="center" gap="xs">
            <Ionicons name="share-outline" size={20} color={tokens.colors.textSecondary} />
            <AppText variant="bodySm" tone="secondary">
              分享
            </AppText>
          </HStack>
        </Pressable>
      </HStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  coverWrapper: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  coverFrame: {
    width: '100%',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
  },
  actionBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  actionItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pressed: {
    opacity: 0.65,
  },
});

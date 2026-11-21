import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, HStack, VStack } from '@/core/ui';
import type { MockListRecord } from '@/shared';

const FEATURED_CAROUSEL = [
  {
    id: 'col-1',
    tag: '效率工具',
    title: '年度 App 精选榜单',
    bg: '#1E293B',
    summary: '精选今年最值得长期使用的效率与专注工具组合。',
  },
  {
    id: 'col-2',
    tag: '桌面美学',
    title: '极简工作流改造计划',
    bg: '#14532D',
    summary: '从灯光、理线到屏幕布局，打造零干扰桌面空间。',
  },
  {
    id: 'col-3',
    tag: '硬件评测',
    title: '随身音频与蓝牙体验',
    bg: '#7C2D12',
    summary: '对比多款随身音频设备的延迟、续航与多设备切换体验。',
  },
] as const;

const MAGAZINE_CARDS = [
  {
    id: 'mag-1',
    kicker: '深度指南',
    title: '效率工具进阶搭配手册',
    lightBg: '#EDE9FE',
    darkBg: '#2E2646',
    lightKicker: '#5B21B6',
    darkKicker: '#C4B5FD',
    summary: '系统化串联笔记、任务与自动化脚本，减少上下文切换成本。',
  },
  {
    id: 'mag-2',
    kicker: '年度精选',
    title: '2026 极简桌面好物推荐',
    lightBg: '#DCFCE7',
    darkBg: '#193529',
    lightKicker: '#166534',
    darkKicker: '#86EFAC',
    summary: '从支架、键盘到拓展坞，精选高质感实用外设清单。',
  },
] as const;

export interface HomeEditorialHeaderProps {
  onSelectRecord?: (record: MockListRecord) => void;
}

export function HomeEditorialHeader({
  onSelectRecord,
}: HomeEditorialHeaderProps): React.JSX.Element {
  const { tokens } = useAppTheme();

  return (
    <VStack gap="lg" style={styles.editorialHeader}>
      {/* 1. Hero Featured Cover Card */}
      <Pressable
        testID="home-hero-card"
        accessibilityRole="button"
        onPress={() =>
          onSelectRecord?.({
            id: 'hero-featured',
            title: '打造高效率的极简桌面工作流',
            tag: '编辑精选',
            summary:
              '从信息架构、空间照明到跨设备同步，拆解一套真正让人专注且可持续迭代的个人数字工作流。',
            meta: '编辑部 · 8 分钟阅读',
          })
        }
        style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
      >
        <View style={styles.heroOverlay}>
          <HStack justify="space-between" align="center">
            <View
              style={[
                styles.heroBadge,
                { backgroundColor: tokens.colors.primary, borderRadius: tokens.radii.full },
              ]}
            >
              <AppText variant="caption" tone="inverse" weight="700">
                编辑精选
              </AppText>
            </View>
            <AppText variant="caption" style={styles.heroMetaText}>
              深度长文 · 8 分钟
            </AppText>
          </HStack>

          <VStack gap="xs">
            <AppText variant="titleLg" style={styles.heroTitle} numberOfLines={2}>
              打造高效率的极简桌面工作流
            </AppText>
            <HStack align="center" gap="xs">
              <View style={styles.heroAuthorDot}>
                <AppText variant="caption" style={styles.heroAuthorInitial}>
                  编
                </AppText>
              </View>
              <AppText variant="caption" style={styles.heroMetaText}>
                编辑部 · 刚刚更新
              </AppText>
            </HStack>
          </VStack>
        </View>
      </Pressable>

      {/* 2. 3-Column Equal-Width Topic Cards */}
      <HStack gap="sm" style={styles.fullRow}>
        {FEATURED_CAROUSEL.map((col) => (
          <Pressable
            key={col.id}
            accessibilityRole="button"
            onPress={() =>
              onSelectRecord?.({
                id: col.id,
                title: col.title,
                tag: col.tag,
                summary: col.summary,
                meta: '精选栏目',
              })
            }
            style={({ pressed }) => [
              styles.carouselCard,
              { backgroundColor: col.bg, borderRadius: tokens.radii.md },
              pressed && styles.pressed,
            ]}
          >
            <AppText variant="caption" style={styles.carouselTag} numberOfLines={1}>
              {col.tag}
            </AppText>
            <AppText variant="bodySm" weight="700" style={styles.carouselTitle} numberOfLines={2}>
              {col.title}
            </AppText>
          </Pressable>
        ))}
      </HStack>

      {/* 3. 2-Column Equal-Width Pastel Editorial Magazine Cards */}
      <HStack gap="sm" style={styles.fullRow}>
        {MAGAZINE_CARDS.map((card) => (
          <Pressable
            key={card.id}
            accessibilityRole="button"
            onPress={() =>
              onSelectRecord?.({
                id: card.id,
                title: card.title,
                tag: card.kicker,
                summary: card.summary,
                meta: '专题精选',
              })
            }
            style={({ pressed }) => [
              styles.magazineCard,
              {
                backgroundColor: tokens.isDark ? card.darkBg : card.lightBg,
                borderRadius: tokens.radii.lg,
              },
              pressed && styles.pressed,
            ]}
          >
            <AppText
              variant="caption"
              weight="700"
              style={{ color: tokens.isDark ? card.darkKicker : card.lightKicker }}
            >
              {card.kicker}
            </AppText>
            <AppText variant="bodyMd" weight="700" numberOfLines={2}>
              {card.title}
            </AppText>
          </Pressable>
        ))}
      </HStack>
    </VStack>
  );
}

const styles = StyleSheet.create({
  editorialHeader: {
    paddingTop: 8,
    paddingBottom: 14,
  },
  heroCard: {
    height: 184,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#231D1A',
  },
  heroOverlay: {
    flex: 1,
    padding: 18,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  heroBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  heroTitle: {
    color: '#FFFFFF',
  },
  heroMetaText: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  heroAuthorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAuthorInitial: {
    color: '#FFFFFF',
    fontSize: 10,
  },
  fullRow: {
    width: '100%',
  },
  carouselCard: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 86,
    padding: 12,
    justifyContent: 'space-between',
  },
  carouselTag: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  carouselTitle: {
    color: '#FFFFFF',
  },
  magazineCard: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 104,
    padding: 14,
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.72,
  },
});

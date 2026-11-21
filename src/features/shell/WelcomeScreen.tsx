/**
 * @module features/shell/WelcomeScreen
 * 职责：首次启动欢迎引导页，展示 3 屏核心特性、进度指示点、跳过与立即体验入口。
 * 边界：通过 onComplete 回调完成引导，不直接耦合路由跳转，便于根壳层挂载与单元测试。
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppRuntime } from '@/core/runtime';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppText, Button, HStack, Screen, VStack } from '@/core/ui';

export interface WelcomeScreenProps {
  onComplete: () => void;
}

interface WelcomeSlide {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
}

const FIRST_SLIDE: WelcomeSlide = {
  key: 'shell',
  icon: 'layers-outline',
  title: '清晰的三层应用骨架',
  description: '单层顶栏、全局侧边抽屉与 4 栏多 Tab 横滑联动，开箱即用。',
};

const SLIDES: readonly WelcomeSlide[] = [
  FIRST_SLIDE,
  {
    key: 'async',
    icon: 'flash-outline',
    title: '丝滑的异步分页体验',
    description: '内置骨架屏加载、下拉刷新、上拉分页与离线弱网兜底，长列表流畅稳定。',
  },
  {
    key: 'theme',
    icon: 'color-palette-outline',
    title: '统一视觉与自由换肤',
    description: '基于零依赖 Design Token，一套布局同时适配浅色与深色模式。',
  },
];

export function WelcomeScreen({ onComplete }: WelcomeScreenProps): React.JSX.Element {
  const { identity } = useAppRuntime();
  const { tokens } = useAppTheme();
  const [step, setStep] = useState(0);

  const isLast = step === SLIDES.length - 1;
  const currentSlide = SLIDES[step] ?? FIRST_SLIDE;

  const handlePrimaryPress = (): void => {
    if (isLast) {
      onComplete();
      return;
    }
    setStep((prev) => Math.min(SLIDES.length - 1, prev + 1));
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <VStack flex={1} justify="space-between" p="xl" style={styles.root}>
        <HStack justify="space-between" align="center">
          <AppText variant="bodySm" tone="brand" weight="600">
            {identity.displayName}
          </AppText>
          <Pressable
            testID="welcome-skip-btn"
            accessibilityRole="button"
            onPress={onComplete}
            hitSlop={10}
          >
            <AppText variant="bodySm" tone="secondary">
              跳过
            </AppText>
          </Pressable>
        </HStack>

        <VStack align="center" gap="lg" style={styles.hero}>
          <View
            style={[
              styles.medallion,
              {
                backgroundColor: tokens.colors.primarySoft,
                borderRadius: tokens.radii.full,
              },
            ]}
          >
            <Ionicons name={currentSlide.icon} size={52} color={tokens.colors.primary} />
          </View>
          <VStack align="center" gap="sm" style={styles.copyBlock}>
            <AppText variant="titleLg" align="center">
              {currentSlide.title}
            </AppText>
            <AppText variant="bodyMd" tone="secondary" align="center">
              {currentSlide.description}
            </AppText>
          </VStack>
        </VStack>

        <VStack gap="lg">
          <HStack justify="center" align="center" gap="sm">
            {SLIDES.map((slide, idx) => {
              const active = idx === step;
              return (
                <View
                  key={slide.key}
                  style={[
                    styles.dot,
                    {
                      width: active ? 24 : 8,
                      backgroundColor: active ? tokens.colors.primary : tokens.colors.border,
                      borderRadius: tokens.radii.full,
                    },
                  ]}
                />
              );
            })}
          </HStack>
          <Button
            testID={isLast ? 'welcome-start-btn' : 'welcome-next-btn'}
            label={isLast ? '立即体验' : '下一步'}
            onPress={handlePrimaryPress}
          />
        </VStack>
      </VStack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hero: {
    paddingVertical: 24,
  },
  medallion: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBlock: {
    maxWidth: 300,
  },
  dot: {
    height: 8,
  },
});

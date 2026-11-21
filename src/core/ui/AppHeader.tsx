/**
 * @module core/ui/AppHeader
 * 职责：通用页面顶部导航栏，支持标准态、滚动折叠大标题态与覆盖头图的透明态，以及返回/抽屉左侧入口和右侧操作区。
 * 边界：仅消费 Design Token 与原语组件，不耦合具体路由或业务状态。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { HStack, VStack } from './Stack';

export type AppHeaderVariant = 'standard' | 'large' | 'transparent';

export interface AppHeaderAction {
  key?: string;
  icon?: React.ReactNode;
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  variant?: AppHeaderVariant;
  /** 大标题形态下用于判断是否折叠为紧凑标题的纵向滚动偏移量。 */
  scrollOffsetY?: number;
  leftAction?: AppHeaderAction;
  showBack?: boolean;
  onBack?: () => void;
  rightActions?: readonly AppHeaderAction[];
  testID?: string;
}

const LARGE_TITLE_COLLAPSE_THRESHOLD = 24;

export function AppHeader({
  title,
  subtitle,
  variant = 'standard',
  scrollOffsetY = 0,
  leftAction,
  showBack = false,
  onBack,
  rightActions,
  testID = 'app-header',
}: AppHeaderProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const isTransparent = variant === 'transparent';
  const isLargeExpanded = variant === 'large' && scrollOffsetY < LARGE_TITLE_COLLAPSE_THRESHOLD;
  const iconColor = isTransparent ? tokens.colors.onPrimary : tokens.colors.textPrimary;

  const resolvedLeftAction: AppHeaderAction | undefined =
    leftAction ??
    (showBack
      ? {
          icon: <Ionicons name="chevron-back" size={22} color={iconColor} />,
          accessibilityLabel: '返回',
          onPress: () => onBack?.(),
          testID: 'app-header-back-btn',
        }
      : undefined);

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        isTransparent
          ? styles.transparentBg
          : {
              backgroundColor: tokens.colors.surface,
              borderBottomColor: tokens.colors.border,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
      ]}
    >
      <HStack px="md" style={styles.bar} align="center" justify="space-between" gap="sm">
        <HStack align="center" gap="sm" style={styles.leftGroup}>
          {resolvedLeftAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={resolvedLeftAction.accessibilityLabel}
              testID={resolvedLeftAction.testID}
              onPress={resolvedLeftAction.onPress}
              hitSlop={8}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              {resolvedLeftAction.icon ?? (
                <AppText variant="bodySm" tone={isTransparent ? 'inverse' : 'primary'}>
                  {resolvedLeftAction.label}
                </AppText>
              )}
            </Pressable>
          ) : null}

          {!isLargeExpanded ? (
            <VStack style={styles.titleBlock}>
              <AppText
                testID="app-header-compact-title"
                variant="titleMd"
                tone={isTransparent ? 'inverse' : 'primary'}
                numberOfLines={1}
              >
                {title}
              </AppText>
              {subtitle ? (
                <AppText
                  variant="caption"
                  tone={isTransparent ? 'inverse' : 'secondary'}
                  numberOfLines={1}
                >
                  {subtitle}
                </AppText>
              ) : null}
            </VStack>
          ) : null}
        </HStack>

        {rightActions && rightActions.length > 0 ? (
          <HStack align="center" gap="xs">
            {rightActions.map((action, index) => (
              <Pressable
                key={action.key ?? `${action.accessibilityLabel}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel}
                testID={action.testID}
                onPress={action.onPress}
                hitSlop={8}
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              >
                {action.icon ?? (
                  <AppText variant="bodySm" tone={isTransparent ? 'inverse' : 'brand'} weight="600">
                    {action.label}
                  </AppText>
                )}
              </Pressable>
            ))}
          </HStack>
        ) : null}
      </HStack>

      {isLargeExpanded ? (
        <VStack px="lg" gap="xs" style={styles.largeTitleBlock}>
          <AppText testID="app-header-large-title" variant="titleLg" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="bodySm" tone="secondary" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </VStack>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  transparentBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  bar: {
    minHeight: 52,
  },
  leftGroup: {
    flex: 1,
  },
  titleBlock: {
    flex: 1,
  },
  actionButton: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pressed: {
    opacity: 0.65,
  },
  largeTitleBlock: {
    paddingBottom: 12,
  },
});

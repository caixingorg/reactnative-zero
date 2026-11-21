/**
 * @module core/ui/DrawerTriggerButton
 * 职责：独立的圆形全局抽屉触发按钮原语，可直接放入单层顶栏左侧（如 TopTabs.leftSlot）。
 * 边界：不直接依赖运行时 Store，通过 onPress 回调触发抽屉打开，保持 Template Core 无反向耦合。
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useAppTheme } from '../theme/theme-context';

export interface DrawerTriggerButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
  icon?: React.ReactNode;
}

export function DrawerTriggerButton({
  onPress,
  accessibilityLabel = '打开菜单',
  testID = 'drawer-trigger-button',
  icon,
}: DrawerTriggerButtonProps): React.JSX.Element {
  const { tokens } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: tokens.colors.surfaceMuted,
          borderRadius: tokens.radii.full,
        },
        pressed && styles.pressed,
      ]}
    >
      {icon ?? <Ionicons name="menu-outline" size={20} color={tokens.colors.textPrimary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
});

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/theme-context';

export interface KeyboardStickyFooterProps {
  /** 键盘关闭时的底部偏移量（默认 0）。 */
  closedOffset?: number;
  /** 键盘弹起时的底部偏移量（默认 0）。 */
  openedOffset?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// 原因：薄封装 KeyboardStickyView 与安全区底边距，让表单提交栏或底部输入条平滑跟随双端软键盘动画升降
export function KeyboardStickyFooter({
  closedOffset = 0,
  openedOffset = 0,
  style,
  children,
}: KeyboardStickyFooterProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();

  // 原因：键盘收起时用 insets.bottom + md 避开底部导航条并保留呼吸间距；键盘弹起时通过 opened 偏移抵消 insets.bottom，避免按钮与键盘之间出现多余白边
  return (
    <KeyboardStickyView offset={{ closed: closedOffset, opened: openedOffset + insets.bottom }}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: tokens.colors.surface,
            borderTopColor: tokens.colors.border,
            paddingHorizontal: tokens.spacing.lg,
            paddingTop: tokens.spacing.md,
            paddingBottom: insets.bottom + tokens.spacing.md,
          },
          style,
        ]}
      >
        {children}
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

import React from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/theme-context';

export interface ScreenProps {
  scrollable?: boolean;
  edges?: Edge[];
  /** 可选页面主体背景色，默认使用语义画布色 tokens.colors.background。 */
  backgroundColor?: string;
  /** 可选顶部状态栏安全区背景色（用于与纯白 TopTabs / AppHeader 无缝同色融合）。 */
  statusBarBackgroundColor?: string;
  /** 可滚动表单页软键盘弹起时，聚焦输入框与键盘顶部的额外间距（默认 24）。 */
  keyboardBottomOffset?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// 原因：基于 react-native-keyboard-controller 统一封装安全区边界与双端软键盘动画避让，彻底消除原生 KeyboardAvoidingView 抽搐与长表单遮挡
export function Screen({
  scrollable = false,
  edges = ['top', 'left', 'right'],
  backgroundColor,
  statusBarBackgroundColor,
  keyboardBottomOffset = 24,
  contentContainerStyle,
  children,
}: ScreenProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const bodyBg = backgroundColor ?? tokens.colors.background;
  const safeAreaBg = statusBarBackgroundColor ?? bodyBg;

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, { backgroundColor: safeAreaBg }]}>
      {scrollable ? (
        <KeyboardAwareScrollView
          style={[styles.flex, { backgroundColor: bodyBg }]}
          bottomOffset={keyboardBottomOffset}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            { padding: tokens.spacing.lg, gap: tokens.spacing.lg },
            contentContainerStyle,
          ]}
        >
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <KeyboardAvoidingView
          style={[styles.flex, { backgroundColor: bodyBg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'translate-with-padding'}
        >
          {children}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
});

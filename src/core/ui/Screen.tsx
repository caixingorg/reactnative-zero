import React from 'react';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/theme-context';

export interface ScreenProps {
  scrollable?: boolean;
  edges?: Edge[];
  /** 可滚动表单页软键盘弹起时，聚焦输入框与键盘顶部的额外间距（默认 24）。 */
  keyboardBottomOffset?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// 原因：基于 react-native-keyboard-controller 统一封装安全区边界与双端软键盘动画避让，彻底消除原生 KeyboardAvoidingView 抽搐与长表单遮挡
export function Screen({
  scrollable = false,
  edges = ['top', 'left', 'right'],
  keyboardBottomOffset = 24,
  contentContainerStyle,
  children,
}: ScreenProps): React.JSX.Element {
  const { tokens } = useAppTheme();

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safeArea, { backgroundColor: tokens.colors.background }]}
    >
      {scrollable ? (
        <KeyboardAwareScrollView
          style={styles.flex}
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
          style={styles.flex}
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

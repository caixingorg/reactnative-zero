/**
 * @module core/ui/FormTemplate
 * 职责：通用表单页模板，集成顶部返回栏、键盘避让滚动区、统一校验错误提示与底部固定提交按钮（复用 KeyboardStickyFooter）。
 * 边界：具体字段控件由 children 注入，校验规则与提交副作用由回调提供。
 */
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/theme-context';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { Box } from './Box';
import { Button } from './Button';
import { KeyboardStickyFooter } from './KeyboardStickyFooter';
import { Screen } from './Screen';
import { VStack } from './Stack';

export interface FormTemplateProps {
  title: string;
  onBack?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  /** 返回错误字符串时拦截提交并展示错误提示；返回 null / undefined 放行提交。 */
  onValidate?: () => string | null | undefined;
  onSubmit: () => void | Promise<void>;
  children: React.ReactNode;
}

export function FormTemplate({
  title,
  onBack,
  submitLabel = '提交',
  submitting = false,
  onValidate,
  onSubmit,
  children,
}: FormTemplateProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (): void => {
    const errorMessage = onValidate?.() ?? null;
    if (errorMessage) {
      setValidationError(errorMessage);
      return;
    }
    setValidationError(null);
    void onSubmit();
  };

  // 原因：外层使用纯 SafeAreaView 而非带 KeyboardAvoidingView 的 Screen，避免与底部 KeyboardStickyFooter 叠加产生双重键盘位移
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.root, { backgroundColor: tokens.colors.background }]}
    >
      <AppHeader title={title} showBack={Boolean(onBack)} onBack={onBack} />
      <Screen scrollable edges={[]}>
        <VStack gap="md">
          {validationError ? (
            <Box p="md" bg="surfaceMuted" radius="md" bordered>
              <AppText variant="bodySm" tone="danger">
                {validationError}
              </AppText>
            </Box>
          ) : null}
          {children}
        </VStack>
      </Screen>
      <KeyboardStickyFooter>
        <Button label={submitLabel} loading={submitting} onPress={handleSubmit} />
      </KeyboardStickyFooter>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

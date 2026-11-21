import React from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';
import { VStack } from './Stack';

export type TextFieldHandle = React.ComponentRef<typeof TextInput>;

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  ref?: React.Ref<TextFieldHandle>;
}

export function TextField({
  label,
  helperText,
  errorMessage,
  ref,
  ...inputProps
}: TextFieldProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const hasError = Boolean(errorMessage);

  return (
    <VStack gap="xs">
      {label ? (
        <AppText variant="bodySm" weight="500">
          {label}
        </AppText>
      ) : null}
      <TextInput
        ref={ref}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        placeholderTextColor={tokens.colors.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: tokens.colors.surface,
            color: tokens.colors.textPrimary,
            borderColor: hasError ? tokens.colors.danger : tokens.colors.border,
            borderRadius: tokens.radii.md,
            paddingHorizontal: tokens.spacing.md,
            paddingVertical: tokens.spacing.sm,
            fontSize: tokens.typography.bodyMd.fontSize,
          },
        ]}
        {...inputProps}
      />
      {errorMessage ? (
        <AppText variant="caption" tone="danger">
          {errorMessage}
        </AppText>
      ) : helperText ? (
        <AppText variant="caption" tone="secondary">
          {helperText}
        </AppText>
      ) : null}
    </VStack>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 44,
    borderWidth: 1,
  },
});

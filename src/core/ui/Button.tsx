import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  testID,
}: ButtonProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const isInactive = disabled || loading;

  const containerVariants: Record<ButtonVariant, ViewStyle> = {
    primary: {
      backgroundColor: tokens.colors.primary,
    },
    secondary: {
      backgroundColor: tokens.colors.surfaceMuted,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    danger: {
      backgroundColor: tokens.colors.danger,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
  };

  const textColor =
    variant === 'primary' || variant === 'danger'
      ? tokens.colors.onPrimary
      : variant === 'ghost'
        ? tokens.colors.primary
        : tokens.colors.textPrimary;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      disabled={isInactive}
      onPress={() => {
        if (!isInactive) {
          onPress();
        }
      }}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: tokens.radii.md,
          paddingVertical: tokens.spacing.md,
          paddingHorizontal: tokens.spacing.lg,
          opacity: isInactive ? 0.55 : pressed ? 0.85 : 1,
        },
        containerVariants[variant],
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={textColor} style={styles.spinner} /> : null}
      <AppText variant="bodyMd" weight="600" style={{ color: textColor }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginRight: 8,
  },
});

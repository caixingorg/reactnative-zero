import React from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import type { TypographyScale } from '../theme/tokens';

export type TypographyVariant = keyof TypographyScale;
export type TextTone =
  'primary' | 'secondary' | 'brand' | 'danger' | 'success' | 'inverse' | 'onPrimary';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

export function AppText({
  variant = 'bodyMd',
  tone = 'primary',
  weight,
  align,
  style,
  children,
  ...rest
}: AppTextProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const typo = tokens.typography[variant];

  const toneColorMap: Record<TextTone, string> = {
    primary: tokens.colors.textPrimary,
    secondary: tokens.colors.textSecondary,
    brand: tokens.colors.primary,
    danger: tokens.colors.danger,
    success: tokens.colors.success,
    inverse: tokens.colors.textInverse,
    onPrimary: tokens.colors.onPrimary,
  };

  const computedStyle: TextStyle = {
    fontSize: typo.fontSize,
    lineHeight: typo.lineHeight,
    fontWeight: weight ?? typo.fontWeight,
    color: toneColorMap[tone],
    textAlign: align,
  };

  return (
    <Text style={[computedStyle, style]} {...rest}>
      {children}
    </Text>
  );
}

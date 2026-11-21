import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useAppTheme } from '../theme/theme-context';
import type { RadiusScale, SemanticColors, SpacingScale } from '../theme/tokens';

export type SpacingKey = keyof SpacingScale;
export type RadiusKey = keyof RadiusScale;
export type BackgroundRole = 'background' | 'surface' | 'surfaceMuted' | 'primary' | 'primarySoft';

export interface BoxProps extends ViewProps {
  row?: boolean;
  flex?: number;
  p?: SpacingKey;
  px?: SpacingKey;
  py?: SpacingKey;
  gap?: SpacingKey;
  bg?: BackgroundRole;
  radius?: RadiusKey;
  bordered?: boolean;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
}

export function Box({
  row,
  flex,
  p,
  px,
  py,
  gap,
  bg,
  radius,
  bordered,
  align,
  justify,
  style,
  children,
  ...rest
}: BoxProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const colors: SemanticColors = tokens.colors;

  const computedStyle: ViewStyle = {
    flexDirection: row ? 'row' : 'column',
    flex,
    padding: p !== undefined ? tokens.spacing[p] : undefined,
    paddingHorizontal: px !== undefined ? tokens.spacing[px] : undefined,
    paddingVertical: py !== undefined ? tokens.spacing[py] : undefined,
    gap: gap !== undefined ? tokens.spacing[gap] : undefined,
    backgroundColor: bg !== undefined ? colors[bg] : undefined,
    borderRadius: radius !== undefined ? tokens.radii[radius] : undefined,
    borderWidth: bordered ? 1 : undefined,
    borderColor: bordered ? colors.border : undefined,
    alignItems: align,
    justifyContent: justify,
  };

  return (
    <View style={[computedStyle, style]} {...rest}>
      {children}
    </View>
  );
}

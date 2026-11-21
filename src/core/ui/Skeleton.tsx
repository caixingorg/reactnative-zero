import React from 'react';
import { View, type DimensionValue } from 'react-native';
import { useAppTheme } from '../theme/theme-context';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  testID?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius,
  testID,
}: SkeletonProps): React.JSX.Element {
  const { tokens } = useAppTheme();

  return (
    <View
      testID={testID}
      style={{
        width,
        height,
        borderRadius: borderRadius ?? tokens.radii.sm,
        backgroundColor: tokens.colors.surfaceMuted,
      }}
    />
  );
}

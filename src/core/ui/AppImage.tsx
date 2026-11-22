import { Image, type ImageContentFit } from 'expo-image';
import React from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import { useAppTheme } from '../theme/theme-context';

export interface AppImageProps {
  uri: string;
  width?: number;
  height?: number;
  borderRadius?: number;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
  style?: StyleProp<ImageStyle>;
}

// 原因：统一封装 expo-image 内存+磁盘二级缓存策略，避免业务页面直接使用低性能原生 Image 组件
export function AppImage({
  uri,
  width = 72,
  height = 72,
  borderRadius,
  contentFit = 'cover',
  accessibilityLabel,
  style,
}: AppImageProps): React.JSX.Element {
  const { tokens } = useAppTheme();
  const isRemote = uri.startsWith('http://') || uri.startsWith('https://');

  return (
    <Image
      source={{ uri }}
      contentFit={contentFit}
      cachePolicy={isRemote ? 'memory-disk' : 'none'}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? tokens.radii.md,
          backgroundColor: tokens.colors.surfaceMuted,
        },
        style,
      ]}
    />
  );
}

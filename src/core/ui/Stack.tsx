import React from 'react';
import { Box, type BoxProps, type SpacingKey } from './Box';

export interface StackProps extends Omit<BoxProps, 'row'> {
  direction?: 'vertical' | 'horizontal';
  gap?: SpacingKey;
}

export function Stack({
  direction = 'vertical',
  gap = 'md',
  ...rest
}: StackProps): React.JSX.Element {
  return <Box row={direction === 'horizontal'} gap={gap} {...rest} />;
}

export function VStack(props: Omit<StackProps, 'direction'>): React.JSX.Element {
  return <Stack direction="vertical" {...props} />;
}

export function HStack(props: Omit<StackProps, 'direction'>): React.JSX.Element {
  return <Stack direction="horizontal" {...props} />;
}

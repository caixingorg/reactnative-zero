import React from 'react';
import { AppText } from './AppText';
import { Button } from './Button';
import { VStack } from './Stack';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  return (
    <VStack p="xl" gap="md" align="center" justify="center" bg="surface" radius="lg" bordered>
      <AppText variant="titleMd" align="center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="bodySm" tone="secondary" align="center">
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="outline" onPress={onAction} />
      ) : null}
    </VStack>
  );
}

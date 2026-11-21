import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppApiError } from '@/core/network/types';
import { useAppRuntime } from '@/core/runtime';
import { AppImage, AppText, Button, EmptyState, HStack, Screen, Skeleton, VStack } from '@/core/ui';
import { FeedStatusBadge } from '@/shared';
import { fetchFeedDetail } from '../api/feed-api';

export interface FeedDetailScreenProps {
  itemId: string;
  onBack?: () => void;
}

export function FeedDetailScreen({ itemId, onBack }: FeedDetailScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const { httpClient } = useAppRuntime();

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['feed', 'detail', itemId],
    queryFn: () => fetchFeedDetail(httpClient, itemId),
  });

  return (
    <Screen scrollable>
      {onBack ? (
        <HStack>
          <Button label={t('common.close')} variant="ghost" onPress={onBack} />
        </HStack>
      ) : null}

      {isLoading ? (
        <VStack gap="md">
          <Skeleton height={180} />
          <Skeleton height={28} />
          <Skeleton height={96} />
        </VStack>
      ) : error || !data ? (
        <EmptyState
          title={t('home.errorTitle')}
          description={
            error instanceof AppApiError && error.kind === 'business'
              ? error.message
              : t('home.errorNetworkDescription')
          }
          actionLabel={t('common.retry')}
          onAction={() => {
            void refetch();
          }}
        />
      ) : (
        <VStack gap="lg" p="lg" bg="surface" radius="lg" bordered>
          <AppImage uri={data.coverUrl} width={320} height={160} style={{ width: '100%' }} />
          <HStack justify="space-between" align="center">
            <AppText variant="caption" tone="brand" weight="600">
              {data.category} · {data.publishedAt}
            </AppText>
            <FeedStatusBadge status={data.status} />
          </HStack>
          <AppText variant="titleLg">{data.title}</AppText>
          <AppText variant="bodyMd" tone="secondary">
            {data.summary}
          </AppText>
          <AppText variant="bodyMd">{data.content}</AppText>
        </VStack>
      )}
    </Screen>
  );
}

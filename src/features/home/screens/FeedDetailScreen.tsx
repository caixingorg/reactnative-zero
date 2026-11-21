import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFilesCapability } from '@/core/capabilities/files';
import { AppApiError } from '@/core/network/types';
import { useAppRuntime, useToast } from '@/core/runtime';
import {
  AppHeader,
  AppText,
  DetailTemplate,
  HStack,
  PageTemplate,
  Screen,
  Skeleton,
  VStack,
} from '@/core/ui';
import { FeedStatusBadge } from '@/shared';
import { fetchFeedDetail } from '../api/feed-api';

export interface FeedDetailScreenProps {
  itemId: string;
  onBack?: () => void;
}

export function FeedDetailScreen({ itemId, onBack }: FeedDetailScreenProps): React.JSX.Element {
  const { t } = useTranslation();
  const { httpClient } = useAppRuntime();
  const files = useFilesCapability();
  const toast = useToast();
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['feed', 'detail', itemId],
    queryFn: () => fetchFeedDetail(httpClient, itemId),
  });

  if (isLoading || error || !data) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <PageTemplate
          status={isLoading ? 'loading' : 'error'}
          header={
            <AppHeader title={t('home.detailTitle')} showBack={Boolean(onBack)} onBack={onBack} />
          }
          errorTitle={t('home.errorTitle')}
          errorDescription={
            error instanceof AppApiError && error.kind === 'business'
              ? error.message
              : t('home.errorNetworkDescription')
          }
          retryLabel={t('common.retry')}
          onRetry={() => {
            void refetch();
          }}
          skeleton={
            <VStack gap="md">
              <Skeleton height={200} />
              <Skeleton height={28} />
              <Skeleton height={96} />
            </VStack>
          }
        />
      </Screen>
    );
  }

  return (
    <DetailTemplate
      headerTitle={t('home.detailTitle')}
      title={data.title}
      subtitle={`${data.category} · ${data.publishedAt}`}
      coverUri={data.coverUrl}
      onBack={onBack}
      liked={liked}
      favorited={favorited}
      onToggleLike={() => setLiked((prev) => !prev)}
      onToggleFavorite={() => setFavorited((prev) => !prev)}
      onShare={() => {
        if (files.enabled) {
          void files.writeTextFileAndShare(
            `detail-${itemId || 'share'}.txt`,
            `${data.title}\n\n${data.summary}\n\n${data.content}`,
          );
        } else {
          toast.show({ message: '已复制分享链接', tone: 'success' });
        }
      }}
    >
      <HStack justify="space-between" align="center">
        <AppText variant="caption" tone="brand" weight="600">
          {data.category}
        </AppText>
        <FeedStatusBadge status={data.status} />
      </HStack>
      <AppText variant="bodyMd" tone="secondary">
        {data.summary}
      </AppText>
      <AppText variant="bodyMd">{data.content}</AppText>
    </DetailTemplate>
  );
}

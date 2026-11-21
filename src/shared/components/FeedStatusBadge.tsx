import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppText, Box, type TextTone } from '@/core/ui';

export type FeedItemStatus = 'published' | 'review' | 'draft';

export interface FeedStatusBadgeProps {
  status: FeedItemStatus;
}

// 原因：将当前派生应用内列表切片与详情切片共用的业务状态徽标沉淀在 Shared Layer，演示跨切片复用而不污染 Template Core
export function FeedStatusBadge({ status }: FeedStatusBadgeProps): React.JSX.Element {
  const { t } = useTranslation();

  const meta: Record<FeedItemStatus, { label: string; tone: TextTone }> = {
    published: { label: t('home.statusPublished'), tone: 'success' },
    review: { label: t('home.statusReview'), tone: 'brand' },
    draft: { label: t('home.statusDraft'), tone: 'secondary' },
  };

  const current = meta[status];

  return (
    <Box px="sm" py="xs" bg="surfaceMuted" radius="sm">
      <AppText variant="caption" tone={current.tone} weight="600">
        {current.label}
      </AppText>
    </Box>
  );
}

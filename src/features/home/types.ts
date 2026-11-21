import type { FeedItemStatus } from '@/shared';

export interface FeedSummaryItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: FeedItemStatus;
  coverUrl: string;
  publishedAt: string;
}

export interface FeedDetailItem extends FeedSummaryItem {
  content: string;
}

export interface PaginatedFeedResponse {
  items: FeedSummaryItem[];
  nextPage: number | null;
}

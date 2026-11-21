import type { HttpClient } from '@/core/network/types';
import type { FeedDetailItem, PaginatedFeedResponse } from '../types';

export function fetchFeedPage(
  httpClient: HttpClient,
  page: number,
): Promise<PaginatedFeedResponse> {
  return httpClient.get<PaginatedFeedResponse>('/feed', {
    params: { page },
  });
}

export function fetchFeedDetail(httpClient: HttpClient, itemId: string): Promise<FeedDetailItem> {
  return httpClient.get<FeedDetailItem>(`/feed/${encodeURIComponent(itemId)}`);
}

/**
 * @module core/ui/ListTemplate
 * 职责：通用分页列表模板，基于 FlashList 统一承接下拉刷新、上拉分页加载、空态与错误重试，并内建前台回顶/刷新登记。
 * 边界：数据获取逻辑由调用方注入，模板本身不耦合具体接口或业务字段。
 */
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Box } from './Box';
import { Button } from './Button';
import { pageActionsRegistry, type PageActions, type PageActionsRegistry } from './page-actions';
import { isScrollAtTop } from './page-shell-logic';
import { PageTemplate, type PageStatus } from './PageTemplate';

export interface ListTemplateProps<T> {
  data: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactElement | null;
  status?: PageStatus;
  refreshing?: boolean;
  onRefresh?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  onRetry?: () => void;
  header?: React.ReactNode;
  listHeader?: React.ReactElement | null;
  loadMoreLabel?: string;
  allLoadedLabel?: string;
  isActive?: boolean;
  registry?: PageActionsRegistry;
}

export function ListTemplate<T>({
  data,
  keyExtractor,
  renderItem,
  status,
  refreshing = false,
  onRefresh,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  emptyTitle = '暂无数据',
  emptyDescription,
  errorTitle = '加载失败',
  errorDescription,
  onRetry,
  header,
  listHeader,
  loadMoreLabel = '加载更多',
  allLoadedLabel = '已加载全部内容',
  isActive = true,
  registry = pageActionsRegistry,
}: ListTemplateProps<T>): React.JSX.Element {
  const listRef = useRef<FlashListRef<T>>(null);
  const offsetYRef = useRef(0);

  const resolvedStatus: PageStatus = status ?? (data.length === 0 ? 'empty' : 'ready');

  const pageActions = useMemo<PageActions>(
    () => ({
      isAtTop: () => isScrollAtTop(offsetYRef.current),
      scrollToTop: () => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
      refresh: () => {
        onRefresh?.();
      },
    }),
    [onRefresh],
  );

  return (
    <PageTemplate
      status={resolvedStatus}
      header={header}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      errorTitle={errorTitle}
      errorDescription={errorDescription}
      onRetry={onRetry ?? onRefresh}
      isActive={isActive}
      pageActions={pageActions}
      registry={registry}
    >
      <View style={styles.listContainer}>
        <FlashList
          ref={listRef}
          data={data}
          keyExtractor={keyExtractor}
          refreshing={refreshing}
          onRefresh={onRefresh}
          scrollEventThrottle={16}
          onScroll={(event) => {
            offsetYRef.current = event.nativeEvent.contentOffset.y;
          }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage && onLoadMore) {
              onLoadMore();
            }
          }}
          ListHeaderComponent={listHeader}
          ItemSeparatorComponent={() => <Box py="xs" />}
          contentContainerStyle={styles.content}
          renderItem={({ item, index }) => renderItem(item, index)}
          ListFooterComponent={
            data.length > 0 ? (
              <Box py="md">
                {hasNextPage && onLoadMore ? (
                  <Button
                    label={loadMoreLabel}
                    variant="outline"
                    loading={isFetchingNextPage}
                    onPress={onLoadMore}
                  />
                ) : (
                  <AppText variant="caption" tone="secondary" align="center">
                    {allLoadedLabel}
                  </AppText>
                )}
              </Box>
            ) : null
          }
        />
      </View>
    </PageTemplate>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
});

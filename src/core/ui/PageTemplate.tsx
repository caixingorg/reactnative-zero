/**
 * @module core/ui/PageTemplate
 * 职责：页面统一外壳，集中处理加载骨架屏、有数据、空态、错误重试、无网络五种状态与可选下拉刷新，并内建前台页面回顶/刷新动作注册。
 * 边界：仅依赖 Template Core 原语与 pageActionsRegistry，不耦合具体业务数据。
 */
import React, { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { EmptyState } from './EmptyState';
import { pageActionsRegistry, type PageActions, type PageActionsRegistry } from './page-actions';
import { Skeleton } from './Skeleton';
import { VStack } from './Stack';

export type PageStatus = 'loading' | 'ready' | 'empty' | 'error' | 'offline';

export interface PageTemplateProps {
  status: PageStatus;
  header?: React.ReactNode;
  skeleton?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  offlineTitle?: string;
  offlineDescription?: string;
  retryLabel?: string;
  onRetry?: () => void;
  /** 可选下拉刷新回调；未传时由内部滚动列表（如 FlashList）自行承接刷新。 */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** 当本页处于前台激活态时，自动向注册表登记回顶与刷新动作。 */
  isActive?: boolean;
  pageActions?: PageActions;
  registry?: PageActionsRegistry;
  children?: React.ReactNode;
}

export function PageTemplate({
  status,
  header,
  skeleton,
  emptyTitle = '暂无数据',
  emptyDescription,
  errorTitle = '加载失败',
  errorDescription = '请检查网络后重试',
  offlineTitle = '当前无网络连接',
  offlineDescription = '请检查设备网络设置后重试',
  retryLabel = '重试',
  onRetry,
  refreshing = false,
  onRefresh,
  isActive = true,
  pageActions,
  registry = pageActionsRegistry,
  children,
}: PageTemplateProps): React.JSX.Element {
  useEffect(() => {
    if (!isActive || !pageActions) {
      return undefined;
    }
    return registry.register(pageActions);
  }, [isActive, pageActions, registry]);

  const fallbackStates: Record<
    Exclude<PageStatus, 'loading' | 'ready'>,
    { title: string; description?: string }
  > = {
    empty: { title: emptyTitle, description: emptyDescription },
    error: { title: errorTitle, description: errorDescription },
    offline: { title: offlineTitle, description: offlineDescription },
  };

  const renderBody = (): React.ReactNode => {
    if (status === 'loading') {
      return (
        <VStack testID="page-template-loading" p="lg" gap="md">
          {skeleton ?? (
            <>
              <Skeleton height={88} />
              <Skeleton height={88} />
              <Skeleton height={88} />
            </>
          )}
        </VStack>
      );
    }

    if (status !== 'ready') {
      const stateCopy = fallbackStates[status];
      return (
        <View style={styles.stateContainer}>
          <EmptyState
            title={stateCopy.title}
            description={stateCopy.description}
            actionLabel={onRetry ? retryLabel : undefined}
            onAction={onRetry}
          />
        </View>
      );
    }

    if (onRefresh) {
      return (
        <ScrollView
          testID="page-template-refresh-scroll"
          contentContainerStyle={styles.refreshContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {children}
        </ScrollView>
      );
    }

    return children ?? null;
  };

  return (
    <View style={styles.container}>
      {header}
      <View style={styles.body}>{renderBody()}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  refreshContent: {
    flexGrow: 1,
  },
  stateContainer: {
    padding: 16,
  },
});

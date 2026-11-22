import React from 'react';
import { useAppTheme } from '@/core/theme/theme-context';
import { AppHeader, PageTemplate, Screen, type PageStatus } from '@/core/ui';

export type StatusPageKind = 'empty' | 'error' | 'offline' | 'not-found';

export interface StatusPageScreenProps {
  kind?: StatusPageKind;
  title?: string;
  onBack?: () => void;
  onRetry?: () => void;
}

export function StatusPageScreen({
  kind = 'empty',
  title = '状态页',
  onBack,
  onRetry,
}: StatusPageScreenProps = {}): React.JSX.Element {
  const { tokens } = useAppTheme();
  const status: PageStatus = kind === 'not-found' ? 'empty' : kind;

  return (
    <Screen
      edges={['top', 'bottom', 'left', 'right']}
      statusBarBackgroundColor={tokens.colors.surface}
    >
      <PageTemplate
        status={status}
        header={<AppHeader title={title} showBack={Boolean(onBack)} onBack={onBack} />}
        emptyTitle={kind === 'not-found' ? '404 · 页面不存在' : '暂无内容'}
        emptyDescription={
          kind === 'not-found'
            ? '您访问的页面可能已移动或删除'
            : '当前没有可展示的内容，稍后再来看看'
        }
        onRetry={onRetry ?? onBack}
        retryLabel={kind === 'not-found' ? '返回上一页' : '重试'}
      />
    </Screen>
  );
}

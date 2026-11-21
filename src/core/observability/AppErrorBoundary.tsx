import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen, VStack } from '../ui';
import type { ErrorReporter, Logger } from './observability';

interface InnerErrorBoundaryProps {
  logger: Logger;
  errorReporter: ErrorReporter;
  title: string;
  description: string;
  retryLabel: string;
  children: React.ReactNode;
}

interface InnerErrorBoundaryState {
  hasError: boolean;
}

// 原因：React 仅支持通过类组件实现渲染异常捕获边界，拦截局部界面崩溃并上报日志缓冲，防止整机白屏闪退
class InnerErrorBoundary extends React.Component<InnerErrorBoundaryProps, InnerErrorBoundaryState> {
  public override state: InnerErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): InnerErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.logger.error(`Render error: ${error.message}`, {
      componentStack: errorInfo.componentStack ?? '',
    });
    this.props.errorReporter.captureException(error, {
      componentStack: errorInfo.componentStack ?? '',
    });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false });
  };

  public override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Screen>
          <VStack flex={1} p="xl" justify="center">
            <EmptyState
              title={this.props.title}
              description={this.props.description}
              actionLabel={this.props.retryLabel}
              onAction={this.handleReset}
            />
          </VStack>
        </Screen>
      );
    }

    return this.props.children;
  }
}

export interface AppErrorBoundaryProps {
  logger: Logger;
  errorReporter: ErrorReporter;
  children: React.ReactNode;
}

export function AppErrorBoundary({
  logger,
  errorReporter,
  children,
}: AppErrorBoundaryProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <InnerErrorBoundary
      logger={logger}
      errorReporter={errorReporter}
      title={t('errorBoundary.title')}
      description={t('errorBoundary.description')}
      retryLabel={t('errorBoundary.retryButton')}
    >
      {children}
    </InnerErrorBoundary>
  );
}

/**
 * @module core/runtime/AppRuntimeProvider
 * 职责：根 Provider 树装配（Query、安全区、键盘、i18n、主题、错误边界及各 Host），并提供 `useAppRuntime` 上下文读取入口。
 * 边界：只消费已创建好的 AppRuntime，不创建任何运行时依赖；严禁静态导入 `src/core/capabilities/*`。
 */
import { QueryClientProvider } from '@tanstack/react-query';
import React, { createContext, useContext, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  type Metrics,
} from 'react-native-safe-area-context';
import type { DevToolsOverlayProps } from '../devtools/DevToolsOverlay';
import { isDevToolsEnabled } from '../devtools/devtools-store';
import { OfflineBanner } from '../network/OfflineBanner';
import { AppErrorBoundary } from '../observability/AppErrorBoundary';
import { installGlobalErrorHandlers } from '../observability/observability';
import { PermissionPromptHost } from '../permissions/PermissionPromptHost';
import { AppThemeProvider } from '../theme/theme-context';
import { ToastHost } from '../ui/ToastHost';
import { ForceUpdateGate } from '../version-policy';
import type { AppRuntime } from './runtime-types';

const FALLBACK_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const AppRuntimeContext = createContext<AppRuntime | null>(null);

export interface AppRuntimeProviderProps {
  runtime: AppRuntime;
  children: React.ReactNode;
}

// 原因：仅在外层 isDevToolsEnabled(runtime.env) 为真时渲染；延迟 require 配合 metro.config.js 生产空桩替换，防止调试代码打入生产包
function NonProdDevToolsBoundary(props: DevToolsOverlayProps): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DevToolsOverlay } = require('../devtools/DevToolsOverlay') as {
    DevToolsOverlay: React.ComponentType<DevToolsOverlayProps>;
  };
  return <DevToolsOverlay {...props} />;
}

export function AppRuntimeProvider({
  runtime,
  children,
}: AppRuntimeProviderProps): React.JSX.Element {
  useEffect(() => {
    return installGlobalErrorHandlers({
      logger: runtime.logger,
      errorReporter: runtime.errorReporter,
    });
  }, [runtime.errorReporter, runtime.logger]);

  return (
    <AppRuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={runtime.queryClient}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics ?? FALLBACK_SAFE_AREA_METRICS}>
          <KeyboardProvider>
            <I18nextProvider i18n={runtime.i18n}>
              <AppThemeProvider
                themeSeed={runtime.identity.theme}
                preferencesStore={runtime.preferencesStore}
                systemColorSchemeOverride={runtime.initialSystemColorScheme}
              >
                <AppErrorBoundary logger={runtime.logger} errorReporter={runtime.errorReporter}>
                  <OfflineBanner
                    connectivityStore={runtime.connectivityStore}
                    privacyGateStore={runtime.privacyGateStore}
                  />
                  <ForceUpdateGate store={runtime.versionPolicyStore}>{children}</ForceUpdateGate>
                  <PermissionPromptHost promptStore={runtime.permissionPromptStore} />
                  {isDevToolsEnabled(runtime.env) ? (
                    <NonProdDevToolsBoundary
                      env={runtime.env}
                      devToolsStore={runtime.devToolsStore}
                      authSessionStore={runtime.authSessionStore}
                      connectivityStore={runtime.connectivityStore}
                      logger={runtime.logger}
                    />
                  ) : null}
                  <ToastHost toastStore={runtime.toastStore} />
                </AppErrorBoundary>
              </AppThemeProvider>
            </I18nextProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </AppRuntimeContext.Provider>
  );
}

export function useAppRuntime(): AppRuntime {
  const context = useContext(AppRuntimeContext);
  if (!context) {
    throw new Error('useAppRuntime 必须在 AppRuntimeProvider 内部调用');
  }
  return context;
}

import React from 'react';
import { BackHandler, Platform, Text } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { appIdentity } from '@root/app.identity';
import { PrivacyGateView } from '@/core/bootstrap/PrivacyGateView';
import {
  installGlobalErrorHandlers,
  type GlobalErrorUtilsLike,
  type GlobalJsErrorHandler,
  type PromiseRejectionTrackerOptions,
} from '@/core/observability/observability';
import { AppRuntimeProvider, useAppRuntime, usePrivacyGate } from '@/core/runtime';
import {
  createMemoryKeyValueStorage,
  createMemorySecretStorage,
} from '@/core/storage/memory-storage';
import { createTestRuntime } from '../helpers/create-test-runtime';
import { TEST_RUNTIME_ENV } from '../helpers/test-env';

// 原因：与生产 src/app/_layout.tsx 的 Stack.Protected 路由守卫同构——未同意前渲染 PrivacyGateView，同意后放行受保护子树
function TestPrivacyGateShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { identity, env, privacyGateStore } = useAppRuntime();
  const isPrivacyReady = usePrivacyGate((state) => state.phase === 'ready');

  if (!isPrivacyReady) {
    return <PrivacyGateView identity={identity} env={env} privacyGateStore={privacyGateStore} />;
  }

  return <>{children}</>;
}

describe('Seam 1: Two-phase Privacy Gate bootstrap & global ErrorBoundary observability', () => {
  it('blocks protected UI and Phase 2 SDK initializers until user accepts Privacy Gate, then skips prompt on cold restart unless policy version bumps', async () => {
    const user = userEvent.setup();
    const sharedKv = createMemoryKeyValueStorage();
    const phase2SdkInit = jest.fn();

    const firstRuntime = createTestRuntime({
      identity: {
        ...appIdentity,
        privacyPolicyVersion: '1.0.0',
        compliance: {
          requirePrivacyConsent: true,
          requirePermissionRationale: true,
        },
      },
      env: TEST_RUNTIME_ENV,
      deferredInitializers: [{ id: 'mock-analytics-sdk', init: phase2SdkInit }],
      overrides: {
        keyValueStorage: sharedKv,
        secretStorage: createMemorySecretStorage(),
        initialDeviceLocale: 'zh-CN',
      },
    });

    const firstMount = await render(
      <AppRuntimeProvider runtime={firstRuntime}>
        <TestPrivacyGateShell>
          <Text>受保护业务首页内容</Text>
        </TestPrivacyGateShell>
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('个人信息保护指引')).toBeTruthy();
    expect(screen.queryByText('受保护业务首页内容')).toBeNull();
    expect(phase2SdkInit).toHaveBeenCalledTimes(0);

    await user.press(screen.getByRole('button', { name: '暂不同意' }));
    // jest-expo 默认 iOS 平台：不提供无效的程序化退出按钮
    expect(
      screen.getByText('您需要同意隐私政策后方可使用完整功能，可随时返回本页重新查看并同意。'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: '不同意并退出应用' })).toBeNull();
    expect(phase2SdkInit).toHaveBeenCalledTimes(0);

    await user.press(screen.getByRole('button', { name: '同意并继续' }));
    expect(screen.getByText('受保护业务首页内容')).toBeTruthy();
    expect(phase2SdkInit).toHaveBeenCalledTimes(1);

    await firstMount.unmount();

    const secondPhase2SdkInit = jest.fn();
    const secondRuntimeSameVersion = createTestRuntime({
      identity: {
        ...appIdentity,
        privacyPolicyVersion: '1.0.0',
        compliance: {
          requirePrivacyConsent: true,
          requirePermissionRationale: true,
        },
      },
      env: TEST_RUNTIME_ENV,
      deferredInitializers: [{ id: 'mock-analytics-sdk', init: secondPhase2SdkInit }],
      overrides: {
        keyValueStorage: sharedKv,
        secretStorage: createMemorySecretStorage(),
        initialDeviceLocale: 'zh-CN',
      },
    });

    const secondMount = await render(
      <AppRuntimeProvider runtime={secondRuntimeSameVersion}>
        <TestPrivacyGateShell>
          <Text>受保护业务首页内容</Text>
        </TestPrivacyGateShell>
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('受保护业务首页内容')).toBeTruthy();
    expect(secondPhase2SdkInit).toHaveBeenCalledTimes(1);

    await secondMount.unmount();

    const thirdPhase2SdkInit = jest.fn();
    const thirdRuntimeBumpedVersion = createTestRuntime({
      identity: {
        ...appIdentity,
        privacyPolicyVersion: '2.0.0',
        compliance: {
          requirePrivacyConsent: true,
          requirePermissionRationale: true,
        },
      },
      env: TEST_RUNTIME_ENV,
      deferredInitializers: [{ id: 'mock-analytics-sdk', init: thirdPhase2SdkInit }],
      overrides: {
        keyValueStorage: sharedKv,
        secretStorage: createMemorySecretStorage(),
        initialDeviceLocale: 'zh-CN',
      },
    });

    await render(
      <AppRuntimeProvider runtime={thirdRuntimeBumpedVersion}>
        <TestPrivacyGateShell>
          <Text>受保护业务首页内容</Text>
        </TestPrivacyGateShell>
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('个人信息保护指引')).toBeTruthy();
    expect(thirdPhase2SdkInit).toHaveBeenCalledTimes(0);
  });

  it('bypasses Privacy Gate immediately on startup when requirePrivacyConsent is disabled for overseas App Instances', async () => {
    const phase2SdkInit = jest.fn();

    const overseasRuntime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          requirePrivacyConsent: false,
          requirePermissionRationale: false,
        },
      },
      env: TEST_RUNTIME_ENV,
      deferredInitializers: [{ id: 'overseas-telemetry', init: phase2SdkInit }],
      overrides: {
        keyValueStorage: createMemoryKeyValueStorage(),
        secretStorage: createMemorySecretStorage(),
      },
    });

    await render(
      <AppRuntimeProvider runtime={overseasRuntime}>
        <TestPrivacyGateShell>
          <Text>Overseas Main Shell</Text>
        </TestPrivacyGateShell>
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('Overseas Main Shell')).toBeTruthy();
    expect(phase2SdkInit).toHaveBeenCalledTimes(1);
  });

  it('suppresses external ErrorReporter before Phase 2 consent, forwards exceptions after consent, and recovers when retrying', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const capturedErrors: Error[] = [];

    const unconsentedRuntime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          requirePrivacyConsent: true,
          requirePermissionRationale: true,
        },
      },
      env: TEST_RUNTIME_ENV,
      observability: {
        errorReporter: {
          initialize: () => {},
          captureException: (error) => {
            capturedErrors.push(error instanceof Error ? error : new Error(String(error)));
          },
        },
      },
      overrides: {
        keyValueStorage: createMemoryKeyValueStorage(),
        secretStorage: createMemorySecretStorage(),
      },
    });

    unconsentedRuntime.errorReporter.captureException(new Error('未授权前触发的异常'));
    expect(capturedErrors).toHaveLength(0);

    const consentedRuntime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          requirePrivacyConsent: false,
          requirePermissionRationale: false,
        },
      },
      env: TEST_RUNTIME_ENV,
      observability: {
        errorReporter: {
          initialize: () => {},
          captureException: (error) => {
            capturedErrors.push(error instanceof Error ? error : new Error(String(error)));
          },
        },
      },
      overrides: {
        keyValueStorage: createMemoryKeyValueStorage(),
        secretStorage: createMemorySecretStorage(),
        initialDeviceLocale: 'zh-CN',
      },
    });

    let shouldCrash = true;
    function UnstableChild(): React.JSX.Element {
      if (shouldCrash) {
        throw new Error('模拟子页面空指针异常');
      }
      return <Text>恢复后的正常业务视图</Text>;
    }

    await render(
      <AppRuntimeProvider runtime={consentedRuntime}>
        <UnstableChild />
      </AppRuntimeProvider>,
    );

    expect(screen.getByText('页面遇到了一点问题')).toBeTruthy();
    expect(capturedErrors).toHaveLength(1);
    expect(capturedErrors[0]?.message).toBe('模拟子页面空指针异常');
    expect(
      consentedRuntime.logger
        .getRecentEntries()
        .some((entry) => entry.message.includes('模拟子页面空指针异常')),
    ).toBe(true);

    shouldCrash = false;
    await user.press(screen.getByRole('button', { name: '重新加载页面' }));
    expect(screen.getByText('恢复后的正常业务视图')).toBeTruthy();

    consoleErrorSpy.mockRestore();
  });

  it('offers the decline-and-exit button only on Android, where BackHandler.exitApp works', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const exitSpy = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      const runtime = createTestRuntime({
        identity: {
          ...appIdentity,
          compliance: { ...appIdentity.compliance, requirePrivacyConsent: true },
        },
        env: TEST_RUNTIME_ENV,
        overrides: {
          keyValueStorage: createMemoryKeyValueStorage(),
          secretStorage: createMemorySecretStorage(),
          initialDeviceLocale: 'zh-CN',
        },
      });
      await render(
        <AppRuntimeProvider runtime={runtime}>
          <TestPrivacyGateShell>
            <Text>受保护业务首页内容</Text>
          </TestPrivacyGateShell>
        </AppRuntimeProvider>,
      );

      await user.press(screen.getByRole('button', { name: '暂不同意' }));
      expect(
        screen.getByText('您需要同意隐私政策后方可使用完整功能；如不同意可直接退出应用。'),
      ).toBeTruthy();
      await user.press(screen.getByRole('button', { name: '不同意并退出应用' }));
      expect(exitSpy).toHaveBeenCalledTimes(1);
    } finally {
      exitSpy.mockRestore();
      jest.restoreAllMocks();
    }
  });

  it('captures global JS exceptions & unhandled Promise rejections, delegates to previous handler, and suspends Phase 2 reporting upon resetPrivacyConsent', async () => {
    const reportedMessages: string[] = [];
    const delegateInitSpy = jest.fn();

    const runtime = createTestRuntime({
      identity: {
        ...appIdentity,
        compliance: {
          requirePrivacyConsent: true,
          requirePermissionRationale: true,
        },
      },
      env: TEST_RUNTIME_ENV,
      observability: {
        errorReporter: {
          initialize: delegateInitSpy,
          captureException: (err) => {
            reportedMessages.push(err instanceof Error ? err.message : String(err));
          },
        },
      },
      overrides: {
        keyValueStorage: createMemoryKeyValueStorage(),
        secretStorage: createMemorySecretStorage(),
      },
    });

    const previousHandler = jest.fn();
    let activeGlobalHandler: GlobalJsErrorHandler | undefined = previousHandler;
    const mockErrorUtils: GlobalErrorUtilsLike = {
      getGlobalHandler: () => activeGlobalHandler,
      setGlobalHandler: (next) => {
        activeGlobalHandler = next;
      },
    };

    let rejectionTracker: PromiseRejectionTrackerOptions | undefined;
    const uninstall = installGlobalErrorHandlers({
      logger: runtime.logger,
      errorReporter: runtime.errorReporter,
      errorUtils: mockErrorUtils,
      hermesInternal: {
        hasPromise: () => true,
        enablePromiseRejectionTracker: (opts) => {
          rejectionTracker = opts;
        },
      },
    });

    // 1. Before Phase 2 consent: global error is logged locally & passed to previousHandler, but NOT sent externally
    activeGlobalHandler?.(new Error('一阶段异步回调异常'), true);
    expect(previousHandler).toHaveBeenCalledTimes(1);
    expect(reportedMessages).toHaveLength(0);
    expect(
      runtime.logger.getRecentEntries().some((e) => e.message.includes('一阶段异步回调异常')),
    ).toBe(true);

    // 2. Accept consent -> Phase 2 initializes -> global JS errors & unhandled rejections report externally
    runtime.privacyGateStore.getState().acceptPrivacyPolicy();
    expect(runtime.privacyGateStore.getState().phase2Initialized).toBe(true);
    expect(delegateInitSpy).toHaveBeenCalledTimes(1);

    activeGlobalHandler?.(new Error('二阶段全局同步异常'), false);
    rejectionTracker?.onUnhandled?.(7, new Error('未捕获的异步 Promise 拒绝'));
    expect(reportedMessages).toEqual(['二阶段全局同步异常', '未捕获的异步 Promise 拒绝']);

    // 3. resetPrivacyConsent resets phase2Initialized to false AND immediately suspends external reporting
    runtime.privacyGateStore.getState().resetPrivacyConsent();
    expect(runtime.privacyGateStore.getState().phase).toBe('awaiting-consent');
    expect(runtime.privacyGateStore.getState().phase2Initialized).toBe(false);

    activeGlobalHandler?.(new Error('撤回隐私同意后的异常'), false);
    expect(reportedMessages).toHaveLength(2);

    // 4. Re-accepting consent re-enables reporting without double-initializing underlying SDK delegate
    runtime.privacyGateStore.getState().acceptPrivacyPolicy();
    expect(runtime.privacyGateStore.getState().phase2Initialized).toBe(true);
    expect(delegateInitSpy).toHaveBeenCalledTimes(1);

    activeGlobalHandler?.(new Error('重新授权后的异常'), false);
    expect(reportedMessages).toEqual([
      '二阶段全局同步异常',
      '未捕获的异步 Promise 拒绝',
      '重新授权后的异常',
    ]);

    uninstall();
    expect(activeGlobalHandler).toBe(previousHandler);
  });
});

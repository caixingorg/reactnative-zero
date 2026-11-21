/**
 * @module core/permissions/permission-coordinator
 * 职责：统一协调敏感权限申请（ADR-0005）：串行排队业务用途告知弹窗（Permission Rationale）并在永久拒绝时引导跳转系统设置。
 * 边界：严禁反向导入 `src/core/capabilities/*`；各原生能力模块须通过 `spec.nativeProbe` 注入具体 OS 权限探测与申请实现。
 */
import { Linking } from 'react-native';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  OsPermissionStatus,
  PermissionCoordinator,
  PermissionOsDriver,
  PermissionRequestOutcome,
  PermissionRequestSpec,
} from './types';

export type PermissionDialogMode = 'rationale' | 'settings-guide';

export interface ActivePermissionPrompt {
  mode: PermissionDialogMode;
  title: string;
  description: string;
  resolve: (confirmed: boolean) => void;
}

export interface PermissionPromptState {
  activePrompt: ActivePermissionPrompt | null;
  confirmPrompt: () => void;
  cancelPrompt: () => void;
}

export type PermissionPromptStore = StoreApi<PermissionPromptState>;

export interface CreatePermissionCoordinatorOptions {
  requirePermissionRationale: boolean;
  overrideDriver?: PermissionOsDriver;
  getBlockedStrings: () => { title: string; description: string };
}

// 原因：遵循 ADR-0005，串行排队权限说明弹窗并对首次与 Android 二次申请 (denied_ask_again) 统一呈现同步用途告知
export function createPermissionCoordinator({
  requirePermissionRationale,
  overrideDriver,
  getBlockedStrings,
}: CreatePermissionCoordinatorOptions): {
  coordinator: PermissionCoordinator;
  promptStore: PermissionPromptStore;
} {
  const promptStore = createStore<PermissionPromptState>((set, get) => ({
    activePrompt: null,
    confirmPrompt: () => {
      const current = get().activePrompt;
      set({ activePrompt: null });
      current?.resolve(true);
    },
    cancelPrompt: () => {
      const current = get().activePrompt;
      set({ activePrompt: null });
      current?.resolve(false);
    },
  }));

  let dialogTail: Promise<void> = Promise.resolve();

  function showDialog(
    mode: PermissionDialogMode,
    title: string,
    description: string,
  ): Promise<boolean> {
    const resultPromise = dialogTail.then(
      () =>
        new Promise<boolean>((resolve) => {
          promptStore.setState({
            activePrompt: {
              mode,
              title,
              description,
              resolve,
            },
          });
        }),
    );
    dialogTail = resultPromise.then(
      () => undefined,
      () => undefined,
    );
    return resultPromise;
  }

  async function openSettings(): Promise<void> {
    if (overrideDriver) {
      await overrideDriver.openSystemSettings();
      return;
    }
    await Linking.openSettings();
  }

  async function readPermissionStatus(spec: PermissionRequestSpec): Promise<OsPermissionStatus> {
    if (overrideDriver) {
      return overrideDriver.getStatus(spec.kind);
    }
    if (spec.nativeProbe) {
      return spec.nativeProbe.getStatus();
    }
    return 'undetermined';
  }

  async function triggerOsPermission(spec: PermissionRequestSpec): Promise<OsPermissionStatus> {
    if (overrideDriver) {
      return overrideDriver.requestOsPermission(spec.kind);
    }
    if (spec.nativeProbe) {
      return spec.nativeProbe.requestPermission();
    }
    return 'denied_ask_again';
  }

  async function presentBlockedGuide(): Promise<void> {
    const blocked = getBlockedStrings();
    const shouldOpenSettings = await showDialog(
      'settings-guide',
      blocked.title,
      blocked.description,
    );
    if (shouldOpenSettings) {
      await openSettings();
    }
  }

  const coordinator: PermissionCoordinator = {
    async requestPermissionWithRationale(
      spec: PermissionRequestSpec,
    ): Promise<PermissionRequestOutcome> {
      const currentStatus = await readPermissionStatus(spec);
      if (currentStatus === 'granted') {
        return { granted: true, status: 'granted' };
      }

      if (currentStatus === 'denied_blocked') {
        await presentBlockedGuide();
        return { granted: false, status: 'denied_blocked' };
      }

      if (
        (currentStatus === 'undetermined' || currentStatus === 'denied_ask_again') &&
        requirePermissionRationale
      ) {
        const acceptedRationale = await showDialog(
          'rationale',
          spec.rationale.title,
          spec.rationale.description,
        );
        if (!acceptedRationale) {
          return {
            granted: false,
            status: currentStatus,
            cancelledByRationale: true,
          };
        }
      }

      const nextStatus = await triggerOsPermission(spec);
      if (nextStatus === 'granted') {
        return { granted: true, status: 'granted' };
      }

      if (nextStatus === 'denied_blocked') {
        await presentBlockedGuide();
      }

      return { granted: false, status: nextStatus };
    },

    async runIfPermitted(options, action) {
      if (!options.enabled) {
        return null;
      }
      const outcome = await this.requestPermissionWithRationale({
        kind: options.kind,
        rationale: options.rationale,
        nativeProbe: options.nativeProbe,
      });
      if (!outcome.granted) {
        return null;
      }
      return action();
    },
  };

  return { coordinator, promptStore };
}

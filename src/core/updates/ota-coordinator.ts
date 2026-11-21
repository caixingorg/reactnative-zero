/**
 * @module core/updates/ota-coordinator
 * 职责：封装可插拔 OTA 热更新协调器与 Privacy Gate 二阶段延迟检查钩子。
 * 边界：默认关闭（ADR-0001/0004）；启用时必须注入 `OtaUpdateDriver` 且仅在用户同意隐私政策后触发联网检查。
 */
import type { DeferredSdkInitializer } from '../bootstrap/privacy-gate-store';

export interface OtaCheckResult {
  enabled: boolean;
  updateAvailable: boolean;
  manifestId?: string;
}

export interface OtaUpdateDriver {
  checkForUpdate(): Promise<{ isAvailable: boolean; manifestId?: string }>;
  fetchAndReload(): Promise<void>;
}

export interface OtaUpdateCoordinator {
  readonly enabled: boolean;
  checkForUpdate(): Promise<OtaCheckResult>;
  applyAvailableUpdate(): Promise<boolean>;
}

// 原因：遵循 US32 与 ADR-0001/0004，OTA 热更新默认关闭以避免无谓启动联网与合规风险；按需启用时必须经由二阶段钩子在隐私同意后唤醒
export function createOtaUpdateCoordinator(options?: {
  enabled?: boolean;
  driver?: OtaUpdateDriver;
}): OtaUpdateCoordinator {
  const enabled = Boolean(options?.enabled && options?.driver);
  const driver = options?.driver;

  return {
    enabled,
    async checkForUpdate(): Promise<OtaCheckResult> {
      if (!enabled || !driver) {
        return { enabled: false, updateAvailable: false };
      }
      const status = await driver.checkForUpdate();
      return {
        enabled: true,
        updateAvailable: status.isAvailable,
        manifestId: status.manifestId,
      };
    },
    async applyAvailableUpdate(): Promise<boolean> {
      if (!enabled || !driver) {
        return false;
      }
      const status = await driver.checkForUpdate();
      if (!status.isAvailable) {
        return false;
      }
      await driver.fetchAndReload();
      return true;
    },
  };
}

export function createDeferredOtaInitializer(
  coordinator: OtaUpdateCoordinator,
): DeferredSdkInitializer {
  return {
    id: 'core:ota-updates',
    init: async () => {
      if (!coordinator.enabled) {
        return;
      }
      await coordinator.checkForUpdate();
    },
  };
}

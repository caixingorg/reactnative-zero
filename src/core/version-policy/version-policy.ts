/**
 * @module core/version-policy/version-policy
 * 职责：客户端版本策略契约——读取服务端下发的最低版本号与 kill-switch，低于最低版本时标记为需要强制升级。
 * 边界：模板只定义客户端契约与适配器接口，服务端由各应用提供；请求默认不携带任何设备标识符，
 * 标识符只有在隐私同意之后、且应用显式提供时才会附带；任何失败都不影响启动（放行）。
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

export type VersionPolicyPlatform = 'ios' | 'android';

export interface VersionPolicyRequest {
  appVersion: string;
  platform: VersionPolicyPlatform;
  /** 仅在隐私同意之后且应用提供了标识符来源时才存在 */
  identifiers?: Readonly<Record<string, string>>;
}

export interface VersionPolicyResponse {
  minVersion?: string;
  updateUrl?: string;
  killSwitches?: Readonly<Record<string, boolean>>;
}

export interface VersionPolicyAdapter {
  fetchPolicy(request: VersionPolicyRequest): Promise<VersionPolicyResponse>;
}

export type VersionPolicyStatus = 'unknown' | 'ok' | 'update-required';

export interface VersionPolicyState {
  status: VersionPolicyStatus;
  updateUrl?: string;
  killSwitches: Readonly<Record<string, boolean>>;
  check: () => Promise<void>;
  isKillSwitchOn: (name: string) => boolean;
}

export type VersionPolicyStore = StoreApi<VersionPolicyState>;

export interface CreateVersionPolicyStoreOptions {
  /** 未提供适配器时整个功能关闭：永远 `ok`、没有任何开关、不发任何请求 */
  adapter?: VersionPolicyAdapter;
  currentVersion: string;
  platform: VersionPolicyPlatform;
  isConsentGranted: () => boolean;
  getIdentifiers?: () => Record<string, string>;
  timeoutMs?: number;
  /**
   * 默认 false：隐私同意之前不发出任何请求（与核心「一阶段零网络」一致）。
   * 只有应用明确接受「版本检查请求会在同意前暴露 IP 等传输层信息」时才设为 true。
   */
  allowBeforeConsent?: boolean;
  /** 服务端没有下发可用的更新链接时使用；两者都没有时无法引导用户升级，因此不会阻断 */
  fallbackUpdateUrl?: string;
}

const VERSION_PATTERN = /^\d{1,6}(?:\.\d{1,6}){0,2}$/;

function parseVersion(raw: string): number[] | null {
  if (!VERSION_PATTERN.test(raw)) {
    return null;
  }
  const parts = raw.split('.').map(Number);
  while (parts.length < 3) {
    parts.push(0);
  }
  return parts;
}

/** 返回负数、0、正数；任一版本号格式非法时返回 null */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    return null;
  }
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

const UPDATE_URL_PATTERN = /^(?:https:\/\/|market:\/\/|itms-apps:\/\/|itms-appss:\/\/)/;

function validUpdateUrl(value: unknown): string | undefined {
  return typeof value === 'string' && UPDATE_URL_PATTERN.test(value) ? value : undefined;
}

interface SanitizedPolicy {
  minVersion?: string;
  updateUrl?: string;
  /** undefined 表示响应没有给出可用的开关表，调用方应保留原值 */
  killSwitches?: Record<string, boolean>;
}

// 原因：服务端响应不可信——只接受格式合法的版本号、商店/https 链接和布尔开关，其余一律忽略，避免脏数据把用户锁死或触发异常行为
function sanitizeResponse(raw: VersionPolicyResponse): SanitizedPolicy {
  let killSwitches: Record<string, boolean> | undefined;
  if (raw.killSwitches && typeof raw.killSwitches === 'object') {
    killSwitches = {};
    for (const [name, value] of Object.entries(raw.killSwitches)) {
      if (typeof value === 'boolean') {
        killSwitches[name] = value;
      }
    }
  }
  return {
    minVersion:
      typeof raw.minVersion === 'string' && VERSION_PATTERN.test(raw.minVersion)
        ? raw.minVersion
        : undefined,
    updateUrl: validUpdateUrl(raw.updateUrl),
    killSwitches,
  };
}

export function createVersionPolicyStore(
  options: CreateVersionPolicyStoreOptions,
): VersionPolicyStore {
  const timeoutMs = options.timeoutMs ?? 5000;
  const fallbackUpdateUrl = validUpdateUrl(options.fallbackUpdateUrl);
  // 原因：并发 check（启动与回前台重叠）时，只有最新发起的那次允许写入状态，旧响应晚到也不能覆盖新结果
  let latestCall = 0;

  return createStore<VersionPolicyState>((set, get) => {
    function settleUnknownAsOk(): void {
      if (get().status === 'unknown') {
        set({ status: 'ok' });
      }
    }

    return {
      status: options.adapter ? 'unknown' : 'ok',
      killSwitches: {},
      isKillSwitchOn: (name) => get().killSwitches[name] === true,
      check: async () => {
        const adapter = options.adapter;
        if (!adapter) {
          return;
        }
        const call = (latestCall += 1);

        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const consent = options.isConsentGranted();
          if (!consent && !options.allowBeforeConsent) {
            // 原因：未同意前不联网，状态保持 unknown（界面按放行处理），同意后再调用 check 即可
            return;
          }
          const request: VersionPolicyRequest = {
            appVersion: options.currentVersion,
            platform: options.platform,
          };
          // 原因：未同意隐私时绝不附带标识符；同意后也只有应用显式提供来源才附带
          if (consent && options.getIdentifiers) {
            request.identifiers = options.getIdentifiers();
          }

          const raw = await Promise.race([
            adapter.fetchPolicy(request),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error('version policy timeout')), timeoutMs);
            }),
          ]);
          if (call !== latestCall) {
            return;
          }

          const policy = sanitizeResponse(raw);
          const comparison = policy.minVersion
            ? compareVersions(options.currentVersion, policy.minVersion)
            : null;
          const updateUrl = policy.updateUrl ?? fallbackUpdateUrl;
          const patch: Partial<VersionPolicyState> = {};
          if (policy.killSwitches) {
            patch.killSwitches = policy.killSwitches;
          }
          if (comparison !== null && comparison < 0 && updateUrl) {
            // 原因：一旦确认低于最低版本，本次会话内不会因后续响应而解除（应用版本不会在会话中变化）
            patch.status = 'update-required';
            patch.updateUrl = updateUrl;
          } else if (get().status === 'unknown') {
            // 原因：没有可用的最低版本信息（空响应、格式错误）或没有可用的更新链接时放行，但不撤销已确认的锁定
            patch.status = 'ok';
          }
          set(patch);
        } catch {
          // 原因：网络失败、超时、适配器或回调异常都按「放行」处理，保持启动路径不受影响；已确认的强制升级状态不会因一次失败被撤销
          if (call === latestCall) {
            settleUnknownAsOk();
          }
        } finally {
          if (timer) {
            clearTimeout(timer);
          }
        }
      },
    };
  });
}

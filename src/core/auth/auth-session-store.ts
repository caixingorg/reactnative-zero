/**
 * @module core/auth/auth-session-store
 * 职责：管理登录会话状态机 (`hydrating` / `authenticated` / `unauthenticated`)、硬件加密凭证读写及 iOS 重装孤儿 Keychain 原子清洗。
 * 边界：所有 Token 强制走 `SecretStorageDriver`，严禁写入普通 MMKV；清空会话时通过 `onSessionCleared` 广播给 Query 缓存联动清理。
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AuthUser, LoginResult, SessionTokens } from '../network/types';
import type { KeyValueStorageDriver, SecretStorageDriver } from '../storage/types';

export const ACCESS_TOKEN_SECRET_KEY = 'auth.access_token';
export const REFRESH_TOKEN_SECRET_KEY = 'auth.refresh_token';
export const USER_PROFILE_SECRET_KEY = 'auth.user_profile';
export const BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY = 'auth.biometric_protected_token';
export const INSTALL_SESSION_MARKER_KEY = 'app.install_session_marker';

export type AuthStatus = 'hydrating' | 'unauthenticated' | 'authenticated';

export interface AuthSessionState {
  status: AuthStatus;
  user: AuthUser | null;
  hydrateSession: () => Promise<void>;
  establishSession: (result: LoginResult) => Promise<void>;
  updateTokens: (tokens: SessionTokens) => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getRefreshToken: () => Promise<string | null>;
  clearSession: () => Promise<void>;
  onSessionCleared: (listener: () => void) => () => void;
}

export type AuthSessionStore = StoreApi<AuthSessionState>;

export interface CreateAuthSessionStoreOptions {
  secretStorage: SecretStorageDriver;
  keyValueStorage?: KeyValueStorageDriver;
  reconcileFreshInstall?: boolean;
  hadSandboxStateAtBoot?: boolean;
  hasLegacyLocalState?: (keyValueStorage: KeyValueStorageDriver) => boolean;
}

// 原因：覆盖升级会保留沙盒 MMKV 中的既有状态，卸载重装必清空沙盒；直接检测沙盒是否为空，避免 auth 模块反向耦合其他业务模块的存储 Key
export function hasPreExistingSandboxState(keyValueStorage: KeyValueStorageDriver): boolean {
  return !keyValueStorage.isEmpty();
}

function parseStoredUser(raw: string | null): AuthUser | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.username === 'string' &&
      typeof parsed.displayName === 'string'
    ) {
      return {
        id: parsed.id,
        username: parsed.username,
        displayName: parsed.displayName,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// 原因：所有身份凭证强制通过硬件加密 SecretStorageDriver 读写；同时处理 Keystore 异常兜底、老版本覆盖升级标记迁移与 iOS 重装孤儿凭证原子擦除
export function createAuthSessionStore(options: CreateAuthSessionStoreOptions): AuthSessionStore {
  const {
    secretStorage,
    keyValueStorage,
    reconcileFreshInstall = false,
    hasLegacyLocalState: customLegacyDetector,
  } = options;
  // 原因：必须在冷启动建仓瞬间（隐私同意弹窗写入 KV 之前）同步采样沙盒状态，防止 iOS 卸载重装后用户刚点同意就被误判为覆盖升级从而绕过孤儿 Keychain 擦除
  const sandboxStateExistedAtBoot =
    options.hadSandboxStateAtBoot ??
    (keyValueStorage
      ? hasPreExistingSandboxState(keyValueStorage) ||
        Boolean(customLegacyDetector?.(keyValueStorage))
      : false);

  const sessionClearedListeners = new Set<() => void>();

  function notifySessionCleared(): void {
    for (const listener of sessionClearedListeners) {
      listener();
    }
  }

  async function wipeSecretsBestEffort(): Promise<void> {
    await Promise.allSettled([
      secretStorage.deleteSecret(ACCESS_TOKEN_SECRET_KEY),
      secretStorage.deleteSecret(REFRESH_TOKEN_SECRET_KEY),
      secretStorage.deleteSecret(USER_PROFILE_SECRET_KEY),
      secretStorage.deleteSecret(BIOMETRIC_PROTECTED_TOKEN_SECRET_KEY),
    ]);
  }

  return createStore<AuthSessionState>((set) => ({
    status: 'hydrating',
    user: null,

    hydrateSession: async () => {
      try {
        if (reconcileFreshInstall && keyValueStorage) {
          const hasInstallMarker = keyValueStorage.getBoolean(INSTALL_SESSION_MARKER_KEY) === true;
          if (!hasInstallMarker) {
            const isInPlaceUpgrade =
              sandboxStateExistedAtBoot || Boolean(customLegacyDetector?.(keyValueStorage));

            if (isInPlaceUpgrade) {
              keyValueStorage.setBoolean(INSTALL_SESSION_MARKER_KEY, true);
            } else {
              await wipeSecretsBestEffort();
              keyValueStorage.setBoolean(INSTALL_SESSION_MARKER_KEY, true);
              set({ status: 'unauthenticated', user: null });
              notifySessionCleared();
              return;
            }
          }
        }

        const [accessToken, refreshToken, rawUser] = await Promise.all([
          secretStorage.getSecret(ACCESS_TOKEN_SECRET_KEY),
          secretStorage.getSecret(REFRESH_TOKEN_SECRET_KEY),
          secretStorage.getSecret(USER_PROFILE_SECRET_KEY),
        ]);

        if (accessToken && refreshToken) {
          set({
            status: 'authenticated',
            user: parseStoredUser(rawUser),
          });
          return;
        }

        set({
          status: 'unauthenticated',
          user: null,
        });
      } catch {
        await wipeSecretsBestEffort();
        set({
          status: 'unauthenticated',
          user: null,
        });
        notifySessionCleared();
      }
    },

    establishSession: async (result: LoginResult) => {
      await Promise.all([
        secretStorage.setSecret(ACCESS_TOKEN_SECRET_KEY, result.tokens.accessToken),
        secretStorage.setSecret(REFRESH_TOKEN_SECRET_KEY, result.tokens.refreshToken),
        secretStorage.setSecret(USER_PROFILE_SECRET_KEY, JSON.stringify(result.user)),
      ]);
      keyValueStorage?.setBoolean(INSTALL_SESSION_MARKER_KEY, true);
      set({
        status: 'authenticated',
        user: result.user,
      });
    },

    updateTokens: async (tokens: SessionTokens) => {
      await Promise.all([
        secretStorage.setSecret(ACCESS_TOKEN_SECRET_KEY, tokens.accessToken),
        secretStorage.setSecret(REFRESH_TOKEN_SECRET_KEY, tokens.refreshToken),
      ]);
    },

    getAccessToken: () => secretStorage.getSecret(ACCESS_TOKEN_SECRET_KEY),

    getRefreshToken: () => secretStorage.getSecret(REFRESH_TOKEN_SECRET_KEY),

    clearSession: async () => {
      try {
        await wipeSecretsBestEffort();
      } finally {
        set({
          status: 'unauthenticated',
          user: null,
        });
        notifySessionCleared();
      }
    },

    onSessionCleared: (listener: () => void) => {
      sessionClearedListeners.add(listener);
      return () => {
        sessionClearedListeners.delete(listener);
      };
    },
  }));
}

/**
 * @module core/storage/native-storage
 * 职责：提供双层本地存储原生驱动——敏感凭证走 `expo-secure-store`（硬件加密），常规 KV 走 `react-native-mmkv`。
 * 边界：凭证强制绑定 `THIS_DEVICE_ONLY` 防 iCloud 备份外泄；默认路径 MMKV 初始化失败须直接抛错，严禁静默降级内存存储。
 */
import * as SecureStore from 'expo-secure-store';
import type { createMMKV as CreateMMKVFn } from 'react-native-mmkv';
import { createMemoryKeyValueStorage } from './memory-storage';
import type { KeyValueStorageDriver, SecretStorageDriver, SecretStorageOptions } from './types';

// 原因：敏感凭证必须落盘系统硬件级密钥库（iOS Keychain / Android Keystore），并支持生物识别核身门控透传
export function createNativeSecretStorage(): SecretStorageDriver {
  return {
    async getSecret(key: string, options?: SecretStorageOptions): Promise<string | null> {
      return SecureStore.getItemAsync(key, {
        requireAuthentication: options?.requireAuthentication,
        authenticationPrompt: options?.authenticationPrompt,
      });
    },
    async setSecret(key: string, value: string, options?: SecretStorageOptions): Promise<void> {
      // 原因：显式绑定 *_THIS_DEVICE_ONLY 访问控制，防止 iOS 凭证随 iCloud/iTunes 加密备份外泄至其他设备
      const keychainAccessible = options?.requireAuthentication
        ? SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY
        : SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;
      await SecureStore.setItemAsync(key, value, {
        requireAuthentication: options?.requireAuthentication,
        authenticationPrompt: options?.authenticationPrompt,
        keychainAccessible,
      });
    },
    async deleteSecret(key: string): Promise<void> {
      await SecureStore.deleteItemAsync(key);
    },
  };
}

export interface NativeKeyValueStorageOptions {
  allowTestMemoryFallback?: boolean;
}

// 原因：仅当调用方显式声明 allowTestMemoryFallback=true 时才允许回退内存存储；生产与默认路径若 MMKV 初始化失败必须立即抛错阻断，杜绝静默丢失隐私同意记录与用户偏好
export function createNativeKeyValueStorage(
  storageId = 'template-core-kv',
  options?: NativeKeyValueStorageOptions,
): KeyValueStorageDriver {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require('react-native-mmkv') as { createMMKV: typeof CreateMMKVFn };
    const mmkv = createMMKV({ id: storageId });
    return {
      getString(key: string): string | undefined {
        return mmkv.getString(key);
      },
      setString(key: string, value: string): void {
        mmkv.set(key, value);
      },
      getBoolean(key: string): boolean | undefined {
        return mmkv.getBoolean(key);
      },
      setBoolean(key: string, value: boolean): void {
        mmkv.set(key, value);
      },
      deleteKey(key: string): void {
        mmkv.remove(key);
      },
      clearAll(): void {
        mmkv.clearAll();
      },
      isEmpty(): boolean {
        return mmkv.getAllKeys().length === 0;
      },
    };
  } catch (err) {
    if (options?.allowTestMemoryFallback === true) {
      return createMemoryKeyValueStorage();
    }
    throw new Error(
      `Failed to initialize native MMKV storage [${storageId}]: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

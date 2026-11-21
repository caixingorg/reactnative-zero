import type { KeyValueStorageDriver, SecretStorageDriver, SecretStorageOptions } from './types';

// 原因：为 Seam 1 自动化集成测试提供内存级存储实现，同时保留生物识别硬件绑定策略元数据以便断言校验
export function createMemorySecretStorage(): SecretStorageDriver & {
  requiresBiometricAuth(key: string): boolean;
} {
  const secrets = new Map<string, { value: string; requireAuth: boolean }>();

  return {
    async getSecret(key: string, _options?: SecretStorageOptions): Promise<string | null> {
      return secrets.get(key)?.value ?? null;
    },
    async setSecret(key: string, value: string, options?: SecretStorageOptions): Promise<void> {
      secrets.set(key, {
        value,
        requireAuth: Boolean(options?.requireAuthentication),
      });
    },
    async deleteSecret(key: string): Promise<void> {
      secrets.delete(key);
    },
    requiresBiometricAuth(key: string): boolean {
      return secrets.get(key)?.requireAuth ?? false;
    },
  };
}

export function createMemoryKeyValueStorage(): KeyValueStorageDriver {
  const store = new Map<string, string | boolean>();

  return {
    getString(key: string): string | undefined {
      const value = store.get(key);
      return typeof value === 'string' ? value : undefined;
    },
    setString(key: string, value: string): void {
      store.set(key, value);
    },
    getBoolean(key: string): boolean | undefined {
      const value = store.get(key);
      return typeof value === 'boolean' ? value : undefined;
    },
    setBoolean(key: string, value: boolean): void {
      store.set(key, value);
    },
    deleteKey(key: string): void {
      store.delete(key);
    },
    clearAll(): void {
      store.clear();
    },
    isEmpty(): boolean {
      return store.size === 0;
    },
  };
}

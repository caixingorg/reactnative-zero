export interface SecretStorageOptions {
  requireAuthentication?: boolean;
  authenticationPrompt?: string;
}

// 原因：将硬件加密机密存储（支持绑定系统级生物识别门控）与常规键值存储拆分为互不兼容接口，阻断敏感凭证误落普通缓存
export interface SecretStorageDriver {
  getSecret(key: string, options?: SecretStorageOptions): Promise<string | null>;
  setSecret(key: string, value: string, options?: SecretStorageOptions): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}

export interface KeyValueStorageDriver {
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  getBoolean(key: string): boolean | undefined;
  setBoolean(key: string, value: boolean): void;
  deleteKey(key: string): void;
  clearAll(): void;
  isEmpty(): boolean;
}

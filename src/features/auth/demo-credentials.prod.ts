import type { DemoLoginCredentials } from './demo-credentials';

// 原因：生产构建物理空桩，确保 Hermes 字节码中零硬编码测试账号与密码残留
export function getDemoLoginCredentials(): DemoLoginCredentials | null {
  return null;
}

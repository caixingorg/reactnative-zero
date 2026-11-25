export interface DemoLoginCredentials {
  readonly username: string;
  readonly password: string;
}

// 原因：仅在非生产构建变体提供演示账号自动填充；APP_VARIANT=production 下由 Metro 物理替换为 demo-credentials.prod.ts
export function getDemoLoginCredentials(): DemoLoginCredentials | null {
  return {
    username: 'admin',
    password: 'password123',
  };
}

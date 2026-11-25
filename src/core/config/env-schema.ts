import { z } from 'zod';
import type { AppVariant, RuntimePublicEnv } from './types';

// 原因：仅允许 http/https 协议，阻断配置错误或恶意注入非网络协议地址导致运行时请求异常
const httpUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: '必须是合法的 http 或 https URL' },
  );

// 原因：可选的 http/https URL（空串视为未配置），用于自建 Sentry / GlitchTip DSN 等按需启用的外接地址
const optionalHttpUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  httpUrlSchema.optional(),
);

// 原因：渠道号（如 official / huawei / xiaomi / oppo / vivo / google_play）将写入 AndroidManifest，仅允许字母、数字、下划线或连字符
const appChannelSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_-]{0,31}$/i,
    '渠道号仅允许字母、数字、下划线或连字符，且长度不超过 32 位',
  );

// 原因：生产变体强制要求 HTTPS，防止凭证与隐私协议走明文 HTTP 遭中间人窃听或被 iOS ATS 运行期阻断；SNAKE_CASE 与 camelCase 两套 Schema 共享同一校验逻辑
function enforceProductionHttps<T extends Record<string, unknown>>(
  appVariant: AppVariant,
  data: T,
  httpsFields: readonly (keyof T & string)[],
  ctx: z.RefinementCtx<T>,
): void {
  if (appVariant !== 'production') {
    return;
  }
  for (const field of httpsFields) {
    const value = data[field];
    if (typeof value !== 'string') {
      continue;
    }
    try {
      if (new URL(value).protocol !== 'https:') {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: '生产变体必须使用 https:// 协议',
        });
      }
    } catch {
      // 已由 httpUrlSchema 报错
    }
  }
}

const rawEnvSchema = z
  .object({
    APP_VARIANT: z.enum(['development', 'staging', 'production']),
    APP_CHANNEL: appChannelSchema.optional(),
    EXPO_PUBLIC_API_BASE_URL: httpUrlSchema,
    EXPO_PUBLIC_PRIVACY_POLICY_URL: httpUrlSchema,
    EXPO_PUBLIC_USER_AGREEMENT_URL: httpUrlSchema,
    EXPO_PUBLIC_ENABLE_MOCK_GATEWAY: z.enum(['true', 'false']).optional(),
    EXPO_PUBLIC_ENABLE_DEVTOOLS: z.enum(['true', 'false']).optional(),
    EXPO_PUBLIC_SENTRY_DSN: optionalHttpUrlSchema,
  })
  .superRefine((data, ctx) => {
    enforceProductionHttps(
      data.APP_VARIANT,
      data,
      [
        'EXPO_PUBLIC_API_BASE_URL',
        'EXPO_PUBLIC_PRIVACY_POLICY_URL',
        'EXPO_PUBLIC_USER_AGREEMENT_URL',
        'EXPO_PUBLIC_SENTRY_DSN',
      ],
      ctx,
    );
  });

const runtimePublicEnvSchema = z
  .object({
    appVariant: z.enum(['development', 'staging', 'production']),
    appChannel: appChannelSchema.optional(),
    apiBaseUrl: httpUrlSchema,
    privacyPolicyUrl: httpUrlSchema,
    userAgreementUrl: httpUrlSchema,
    enableMockGateway: z.boolean().optional(),
    enableDevTools: z.boolean().optional(),
    sentryDsn: optionalHttpUrlSchema,
  })
  .superRefine((data, ctx) => {
    enforceProductionHttps(
      data.appVariant,
      data,
      ['apiBaseUrl', 'privacyPolicyUrl', 'userAgreementUrl', 'sentryDsn'],
      ctx,
    );
  });

export class EnvValidationError extends Error {
  public readonly invalidFields: string[];

  constructor(invalidFields: string[], detailMessage: string) {
    super(`环境变量校验失败 [${invalidFields.join(', ')}]: ${detailMessage}`);
    this.name = 'EnvValidationError';
    this.invalidFields = invalidFields;
  }
}

function throwEnvValidationError(error: z.ZodError): never {
  const invalidFields = Array.from(
    new Set(error.issues.map((issue) => issue.path.join('.') || 'UNKNOWN_ENV')),
  );
  const detail = error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new EnvValidationError(invalidFields, detail);
}

// 原因：构建期与启动期统一走强模式校验，杜绝漏配环境变量导致生产运行期出现隐蔽 undefined 故障
export function parseRuntimeEnv(rawEnv: Record<string, string | undefined>): RuntimePublicEnv {
  const result = rawEnvSchema.safeParse(rawEnv);
  if (!result.success) {
    throwEnvValidationError(result.error);
  }

  return {
    appVariant: result.data.APP_VARIANT,
    appChannel: result.data.APP_CHANNEL ?? 'official',
    apiBaseUrl: result.data.EXPO_PUBLIC_API_BASE_URL,
    privacyPolicyUrl: result.data.EXPO_PUBLIC_PRIVACY_POLICY_URL,
    userAgreementUrl: result.data.EXPO_PUBLIC_USER_AGREEMENT_URL,
    // 原因：生产变体强制锁死 enableMockGateway 为 false，杜绝本地 Mock 账号混入正式发布包
    enableMockGateway:
      result.data.APP_VARIANT !== 'production' &&
      result.data.EXPO_PUBLIC_ENABLE_MOCK_GATEWAY === 'true',
    // 原因：DevTools 开关随 extra.runtimeEnv 下发而非依赖 Metro 内联 process.env；生产变体强制关闭，非生产缺省开启
    enableDevTools:
      result.data.APP_VARIANT !== 'production' &&
      result.data.EXPO_PUBLIC_ENABLE_DEVTOOLS !== 'false',
    sentryDsn: result.data.EXPO_PUBLIC_SENTRY_DSN,
  };
}

// 原因：直接校验 app.config.ts 下发的 camelCase extra.runtimeEnv，消除启动期来回映射 SNAKE_CASE 的冗余转换
export function parseRuntimePublicEnv(raw: unknown): RuntimePublicEnv {
  const result = runtimePublicEnvSchema.safeParse(raw);
  if (!result.success) {
    throwEnvValidationError(result.error);
  }

  return {
    appVariant: result.data.appVariant,
    appChannel: result.data.appChannel ?? 'official',
    apiBaseUrl: result.data.apiBaseUrl,
    privacyPolicyUrl: result.data.privacyPolicyUrl,
    userAgreementUrl: result.data.userAgreementUrl,
    enableMockGateway:
      result.data.appVariant !== 'production' && result.data.enableMockGateway === true,
    enableDevTools: result.data.appVariant !== 'production' && result.data.enableDevTools !== false,
    sentryDsn: result.data.sentryDsn,
  };
}

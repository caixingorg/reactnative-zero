import type { RuntimePublicEnv } from '@/core/config/types';

export const TEST_RUNTIME_ENV: RuntimePublicEnv = {
  appVariant: 'development',
  apiBaseUrl: 'https://api-dev.example.com',
  privacyPolicyUrl: 'https://legal.example.com/privacy',
  userAgreementUrl: 'https://legal.example.com/terms',
};

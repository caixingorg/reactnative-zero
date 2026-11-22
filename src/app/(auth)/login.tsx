import { useRouter } from 'expo-router';
import React from 'react';
import { useAppRuntime } from '@/core/runtime';
import { LoginScreen } from '@/features/auth';

export default function LoginRoute(): React.JSX.Element {
  const router = useRouter();
  const { env } = useAppRuntime();

  return (
    <LoginScreen
      onOpenRegister={() => router.push('/register-demo')}
      onOpenPrivacyPolicy={() => router.push('/privacy-consent')}
      onOpenUserAgreement={() =>
        router.push({
          pathname: '/webview',
          params: { url: env.userAgreementUrl, title: '用户协议' },
        })
      }
    />
  );
}

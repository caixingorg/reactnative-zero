import { useRouter } from 'expo-router';
import React from 'react';
import { useAppRuntime } from '@/core/runtime';
import { LoginScreen } from '@/features/auth';
import { useLegalDocumentOpener } from '@/shared';

export default function LoginRoute(): React.JSX.Element {
  const router = useRouter();
  const { env } = useAppRuntime();
  const openLegalDocument = useLegalDocumentOpener();

  return (
    <LoginScreen
      onOpenRegister={() => router.push('/register')}
      onOpenPrivacyPolicy={() =>
        openLegalDocument({ url: env.privacyPolicyUrl, title: '隐私政策' })
      }
      onOpenUserAgreement={() =>
        openLegalDocument({ url: env.userAgreementUrl, title: '用户协议' })
      }
    />
  );
}

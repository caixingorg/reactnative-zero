import { useRouter } from 'expo-router';
import React from 'react';
import { LoginScreen } from '@/features/auth';

export default function LoginRoute(): React.JSX.Element {
  const router = useRouter();

  return <LoginScreen onOpenRegister={() => router.push('/register-demo')} />;
}

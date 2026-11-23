import { useRouter } from 'expo-router';
import React from 'react';
import { useAppRuntime } from '@/core/runtime';
import { RegisterScreen } from '@/features/auth';
import { useSafeBack } from '@/shared';

export default function RegisterRoute(): React.JSX.Element {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { authSessionStore } = useAppRuntime();

  const handleSubmitted = (): void => {
    const isAuthenticated = authSessionStore.getState().status === 'authenticated';
    if (isAuthenticated) {
      void authSessionStore
        .getState()
        .clearSession()
        .then(() => {
          router.replace('/login');
        });
      return;
    }
    router.replace('/login');
  };

  return <RegisterScreen onBack={safeBack} onSubmitted={handleSubmitted} />;
}

import { useRouter } from 'expo-router';
import React from 'react';
import { useAppRuntime } from '@/core/runtime';
import { ProfileRegisterDemoScreen } from '@/features/demo';

export default function RegisterDemoRoute(): React.JSX.Element {
  const router = useRouter();
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

  return <ProfileRegisterDemoScreen onBack={() => router.back()} onSubmitted={handleSubmitted} />;
}

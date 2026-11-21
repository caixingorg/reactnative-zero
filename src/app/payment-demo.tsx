import { useRouter } from 'expo-router';
import React from 'react';
import { PaymentDemoScreen } from '@/features/demo';

export default function PaymentDemoRoute(): React.JSX.Element {
  const router = useRouter();
  return <PaymentDemoScreen onBack={() => router.back()} />;
}

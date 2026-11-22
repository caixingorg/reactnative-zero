import { useRouter } from 'expo-router';
import React from 'react';
import { CheckoutScreen } from '@/features/payment';

export default function CheckoutRoute(): React.JSX.Element {
  const router = useRouter();
  return <CheckoutScreen onBack={() => router.back()} />;
}

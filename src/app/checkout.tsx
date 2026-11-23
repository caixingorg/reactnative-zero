import React from 'react';
import { CheckoutScreen } from '@/features/payment';
import { useSafeBack } from '@/shared';

export default function CheckoutRoute(): React.JSX.Element {
  const safeBack = useSafeBack();
  return <CheckoutScreen onBack={safeBack} />;
}

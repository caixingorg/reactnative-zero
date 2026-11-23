import React from 'react';
import { FeedbackFormScreen } from '@/features/feedback';
import { useSafeBack } from '@/shared';

export default function FormStackRoute(): React.JSX.Element {
  const safeBack = useSafeBack();
  return <FeedbackFormScreen onBack={safeBack} />;
}

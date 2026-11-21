import { useRouter } from 'expo-router';
import React from 'react';
import { FeedbackFormScreen } from '@/features/feedback';

export default function FormStackRoute(): React.JSX.Element {
  const router = useRouter();
  return <FeedbackFormScreen onBack={() => router.back()} />;
}

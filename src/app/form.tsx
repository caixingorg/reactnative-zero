import { useRouter } from 'expo-router';
import React from 'react';
import { FeedbackFormScreen } from '@/features/templates';

export default function FormStackRoute(): React.JSX.Element {
  const router = useRouter();
  return <FeedbackFormScreen onBack={() => router.back()} />;
}

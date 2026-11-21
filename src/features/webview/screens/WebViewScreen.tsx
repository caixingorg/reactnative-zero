import React from 'react';
import { SecureHybridWebView } from '@/core/capabilities/webview';

export interface WebViewScreenProps {
  url: string;
  title?: string;
  onClose?: () => void;
}

export function WebViewScreen({ url, title, onClose }: WebViewScreenProps): React.JSX.Element {
  return <SecureHybridWebView url={url} title={title} onClose={onClose} />;
}

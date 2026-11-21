import type { AppIdentity } from './src/core/config/types';

// 原因：单点维护派生应用品牌、色板圆角种子、包名与能力总闸（位于 src/core 之外），克隆换肤与改名不产生内核冲突
export const appIdentity: AppIdentity = {
  displayName: '企业移动底座',
  slug: 'enterprise-rn-template',
  iosBundleIdentifier: 'com.enterprise.rntemplate',
  androidPackage: 'com.enterprise.rntemplate',
  scheme: 'enterprisern',
  defaultLanguage: 'zh-CN',
  theme: {
    primaryLight: '#2563EB',
    primaryDark: '#60A5FA',
    radiusBase: 10,
    spacingUnit: 4,
  },
  privacyPolicyVersion: '1.0.0',
  compliance: {
    requirePrivacyConsent: true,
    requirePermissionRationale: true,
  },
  capabilities: {
    camera: true,
    photoLibrary: true,
    mediaLibrary: true,
    filesAndSharing: true,
    webview: true,
    biometrics: true,
    location: true,
    notifications: true,
    audioVideo: true,
    backgroundAudio: false,
  },
};

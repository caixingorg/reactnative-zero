/**
 * @module core/i18n/i18n
 * 职责：实例化隔离的 `i18next` 容器并合并上层注入的业务词条，提供合规受控的设备语言探测函数。
 * 边界：`detectDeviceLanguage()` 仅允许在用户同意隐私政策后调用；业务词条须放 `src/shared/i18n/` 注入，勿直接改动内核词条。
 */
import * as Localization from 'expo-localization';
import { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  coreTranslationResources,
  type SupportedLanguage,
  type TranslationBundleMap,
} from './resources';

export function normalizeSupportedLanguage(rawLocale: string | undefined): SupportedLanguage {
  if (!rawLocale) {
    return 'zh-CN';
  }
  return rawLocale.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

export function detectDeviceLanguage(): SupportedLanguage {
  try {
    const locales = Localization.getLocales();
    const primaryTag = locales[0]?.languageTag;
    return normalizeSupportedLanguage(primaryTag);
  } catch {
    return 'zh-CN';
  }
}

// 原因：每次创建运行时均实例化独立 i18n 容器并合并上层注入的业务词条，避免全局单例串染与内核反向耦合
export function createAppI18n(
  initialLanguage: SupportedLanguage,
  extraTranslations?: TranslationBundleMap,
): I18nInstance {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    resources: {
      'zh-CN': {
        translation: {
          ...coreTranslationResources['zh-CN'],
          ...(extraTranslations?.['zh-CN'] ?? {}),
        },
      },
      'en-US': {
        translation: {
          ...coreTranslationResources['en-US'],
          ...(extraTranslations?.['en-US'] ?? {}),
        },
      },
    },
    lng: initialLanguage,
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
    initAsync: false,
  });
  return instance;
}

/**
 * @module core/preferences/preferences-store
 * 职责：持久化管理用户外观模式 (`light` / `dark` / `system`) 与界面语言偏好，并联动切换 `i18next`。
 * 边界：仅存非敏感本地偏好（走 MMKV），严禁存放身份凭证或个人隐私数据。
 */
import type { i18n as I18nInstance } from 'i18next';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { normalizeSupportedLanguage } from '../i18n/i18n';
import type { SupportedLanguage } from '../i18n/resources';
import type { KeyValueStorageDriver } from '../storage/types';
import type { ThemePreference } from '../theme/tokens';

export const THEME_STORAGE_KEY = 'preferences.theme_mode';
export const LANGUAGE_STORAGE_KEY = 'preferences.language';

export interface PreferencesState {
  themePreference: ThemePreference;
  language: SupportedLanguage;
  setThemePreference: (preference: ThemePreference) => void;
  setLanguage: (language: SupportedLanguage) => void;
  resetPreferences: () => void;
}

export type PreferencesStore = StoreApi<PreferencesState>;

function parseStoredThemePreference(raw: string | undefined): ThemePreference {
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return 'system';
}

export interface CreatePreferencesStoreOptions {
  keyValueStorage: KeyValueStorageDriver;
  i18n: I18nInstance;
  fallbackLanguage: SupportedLanguage;
}

export function readInitialLanguage(
  keyValueStorage: KeyValueStorageDriver,
  fallbackLanguage: SupportedLanguage,
): SupportedLanguage {
  const stored = keyValueStorage.getString(LANGUAGE_STORAGE_KEY);
  if (stored === 'zh-CN' || stored === 'en-US') {
    return stored;
  }
  return normalizeSupportedLanguage(fallbackLanguage);
}

// 原因：同步从常规键值存储恢复外观与语言偏好，确保冷启动首帧无白屏闪烁或语言跳变
export function createPreferencesStore({
  keyValueStorage,
  i18n,
  fallbackLanguage,
}: CreatePreferencesStoreOptions): PreferencesStore {
  const initialTheme = parseStoredThemePreference(keyValueStorage.getString(THEME_STORAGE_KEY));
  const initialLanguage = readInitialLanguage(keyValueStorage, fallbackLanguage);

  return createStore<PreferencesState>((set) => ({
    themePreference: initialTheme,
    language: initialLanguage,
    setThemePreference: (preference: ThemePreference) => {
      keyValueStorage.setString(THEME_STORAGE_KEY, preference);
      set({ themePreference: preference });
    },
    setLanguage: (language: SupportedLanguage) => {
      keyValueStorage.setString(LANGUAGE_STORAGE_KEY, language);
      void i18n.changeLanguage(language);
      set({ language });
    },
    resetPreferences: () => {
      const normalizedFallback = normalizeSupportedLanguage(fallbackLanguage);
      void i18n.changeLanguage(normalizedFallback);
      set({
        themePreference: 'system',
        language: normalizedFallback,
      });
    },
  }));
}

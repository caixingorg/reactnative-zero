/**
 * @module core/theme/theme-context
 * 职责：根据 `BrandThemeSeed` 与用户偏好/系统外观推导亮暗双模式语义 Design Token 并同步状态栏样式（ADR-0003）。
 * 边界：零第三方样式库依赖；业务组件统一通过 `useAppTheme()` 消费 Token，禁止硬编码色值。
 */
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useStore } from 'zustand';
import type { BrandThemeSeed } from '../config/types';
import type { PreferencesStore } from '../preferences/preferences-store';
import {
  buildDesignTokens,
  type DesignTokens,
  type ResolvedColorScheme,
  type ThemePreference,
} from './tokens';

export interface AppThemeContextValue {
  tokens: DesignTokens;
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export interface AppThemeProviderProps {
  themeSeed: BrandThemeSeed;
  preferencesStore: PreferencesStore;
  systemColorSchemeOverride?: ResolvedColorScheme;
  children: React.ReactNode;
}

export function AppThemeProvider({
  themeSeed,
  preferencesStore,
  systemColorSchemeOverride,
  children,
}: AppThemeProviderProps): React.JSX.Element {
  const deviceScheme = useColorScheme();
  const themePreference = useStore(preferencesStore, (state) => state.themePreference);
  const setThemePreference = useStore(preferencesStore, (state) => state.setThemePreference);

  const resolvedScheme: ResolvedColorScheme = useMemo(() => {
    if (themePreference === 'light' || themePreference === 'dark') {
      return themePreference;
    }
    const effectiveSystem = systemColorSchemeOverride ?? deviceScheme;
    return effectiveSystem === 'dark' ? 'dark' : 'light';
  }, [deviceScheme, systemColorSchemeOverride, themePreference]);

  const tokens = useMemo(
    () => buildDesignTokens(resolvedScheme, themeSeed),
    [resolvedScheme, themeSeed],
  );

  const value = useMemo<AppThemeContextValue>(
    () => ({
      tokens,
      themePreference,
      setThemePreference,
    }),
    [setThemePreference, themePreference, tokens],
  );

  // 原因：系统状态栏前景色必须跟随应用内计算后的亮暗主题而非系统外观，防止浅色系统下手动切深色时出现黑字叠深底
  return (
    <AppThemeContext.Provider value={value}>
      <StatusBar style={tokens.isDark ? 'light' : 'dark'} />
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme(): AppThemeContextValue {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppTheme 必须在 AppRuntimeProvider 内部调用');
  }
  return context;
}

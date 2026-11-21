import type { BrandThemeSeed } from '../config/types';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedColorScheme = 'light' | 'dark';

// 原因：第一层底层基础调色板（Primitive Palette），与具体界面语义解耦，供第二层语义令牌按亮暗主题映射
export const PRIMITIVE_PALETTE = {
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate700: '#334155',
  slate800: '#1F2937',
  slate900: '#111827',
  slate950: '#090D16',
  white: '#FFFFFF',
  green500: '#22C55E',
  green600: '#16A34A',
  amber500: '#F59E0B',
  amber600: '#D97706',
  red500: '#EF4444',
  red600: '#DC2626',
  scrimLight: 'rgba(15, 23, 42, 0.45)',
  scrimDark: 'rgba(2, 6, 23, 0.72)',
} as const;

export interface SemanticColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  onPrimary: string;
  scrim: string;
  border: string;
  primary: string;
  primarySoft: string;
  success: string;
  warning: string;
  danger: string;
}

export interface SpacingScale {
  none: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface RadiusScale {
  sm: number;
  md: number;
  lg: number;
  full: number;
}

export interface TypographyToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
}

export interface TypographyScale {
  titleLg: TypographyToken;
  titleMd: TypographyToken;
  bodyMd: TypographyToken;
  bodySm: TypographyToken;
  caption: TypographyToken;
}

export interface DesignTokens {
  scheme: ResolvedColorScheme;
  isDark: boolean;
  colors: SemanticColors;
  spacing: SpacingScale;
  radii: RadiusScale;
  typography: TypographyScale;
}

const TYPOGRAPHY: TypographyScale = {
  titleLg: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  titleMd: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  bodyMd: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodySm: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
};

const HEX6_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// 原因：严格校验 6 位十六进制品牌色并生成柔和半透明底色，非法色值显式报错而非静默退化为不透明色块
function buildSoftBrandTint(hexColor: string, alphaHex: string): string {
  const normalized = hexColor.trim();
  if (!HEX6_PATTERN.test(normalized)) {
    throw new Error(`无效的品牌十六进制颜色值 "${hexColor}"，必须采用 #RRGGBB 格式`);
  }
  return `${normalized}${alphaHex}`;
}

function buildSpacingScale(unit: number): SpacingScale {
  return {
    none: 0,
    xs: unit,
    sm: unit * 2,
    md: unit * 3,
    lg: unit * 4,
    xl: unit * 6,
    xxl: unit * 8,
  };
}

function buildRadiusScale(base: number): RadiusScale {
  return {
    sm: Math.max(2, Math.round(base * 0.6)),
    md: base,
    lg: Math.round(base * 1.6),
    full: 999,
  };
}

// 原因：遵循 ADR-0003，由单一 BrandThemeSeed 同步派生双层亮暗语义令牌、圆角与间距刻度，支持派生应用单点全局换肤
export function buildDesignTokens(scheme: ResolvedColorScheme, seed: BrandThemeSeed): DesignTokens {
  const isDark = scheme === 'dark';
  const activePrimary = isDark ? seed.primaryDark : seed.primaryLight;

  const colors: SemanticColors = isDark
    ? {
        background: PRIMITIVE_PALETTE.slate950,
        surface: PRIMITIVE_PALETTE.slate900,
        surfaceMuted: PRIMITIVE_PALETTE.slate800,
        textPrimary: PRIMITIVE_PALETTE.slate50,
        textSecondary: PRIMITIVE_PALETTE.slate400,
        textInverse: PRIMITIVE_PALETTE.slate950,
        onPrimary: PRIMITIVE_PALETTE.white,
        scrim: PRIMITIVE_PALETTE.scrimDark,
        border: PRIMITIVE_PALETTE.slate700,
        primary: activePrimary,
        primarySoft: buildSoftBrandTint(activePrimary, '2E'),
        success: PRIMITIVE_PALETTE.green500,
        warning: PRIMITIVE_PALETTE.amber500,
        danger: PRIMITIVE_PALETTE.red500,
      }
    : {
        background: PRIMITIVE_PALETTE.slate50,
        surface: PRIMITIVE_PALETTE.white,
        surfaceMuted: PRIMITIVE_PALETTE.slate100,
        textPrimary: PRIMITIVE_PALETTE.slate900,
        textSecondary: PRIMITIVE_PALETTE.slate500,
        textInverse: PRIMITIVE_PALETTE.white,
        onPrimary: PRIMITIVE_PALETTE.white,
        scrim: PRIMITIVE_PALETTE.scrimLight,
        border: PRIMITIVE_PALETTE.slate200,
        primary: activePrimary,
        primarySoft: buildSoftBrandTint(activePrimary, '1A'),
        success: PRIMITIVE_PALETTE.green600,
        warning: PRIMITIVE_PALETTE.amber600,
        danger: PRIMITIVE_PALETTE.red600,
      };

  return {
    scheme,
    isDark,
    colors,
    spacing: buildSpacingScale(seed.spacingUnit),
    radii: buildRadiusScale(seed.radiusBase),
    typography: TYPOGRAPHY,
  };
}

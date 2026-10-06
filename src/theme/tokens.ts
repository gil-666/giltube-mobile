import { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';

import {
  THEME_CORNERS,
  buildThemeVariables,
  isDefaultThemeColors,
  themeScheme,
  type ThemeAppearance,
} from './themeMath';

// The app's stock look. The default theme uses these exact values; any other
// theme derives the same names from its three colors (see applyThemeTokens).
const STOCK_COLORS = {
  canvas: '#09090B',
  canvasRaised: '#111114',
  surface: '#18181B',
  surfaceStrong: '#27272A',
  border: 'rgba(255, 255, 255, 0.09)',
  borderStrong: 'rgba(239, 68, 68, 0.25)',
  text: '#FAFAFA',
  textMuted: '#A1A1AA',
  textDim: '#71717A',
  accent: '#DC2626',
  accentBright: '#EF4444',
  accentDark: '#7F1D1D',
  // Text and icons on accent/accentBright fills.
  onAccent: '#FFFFFF',
  // The theme's second color: selection, toggles, links.
  highlight: '#3B82F6',
  onHighlight: '#FFFFFF',
  // Text on a fill that uses colors.text (e.g. a selected chip).
  onText: '#000000',
  // Screen backgrounds. Transparent when the theme has a backdrop (gradient,
  // image or effect) so ThemeBackdrop shows through behind each screen.
  screen: '#09090B',
  gilid: '#22D3EE',
  success: '#34D399',
  warning: '#FBBF24',
  // Errors and destructive actions (not the brand color).
  danger: '#FCA5A5',
  // Fixed: video and artwork overlays stay black and white in every theme.
  black: '#000000',
  white: '#FFFFFF',
};

export type ThemeColorName = keyof typeof STOCK_COLORS;

const STOCK_RADII = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 };

/**
 * Live theme tokens. These objects are updated in place when the theme
 * changes, so read them during render (or inside a makeStyles factory), not
 * at module load.
 */
export const colors: Record<ThemeColorName, string> = { ...STOCK_COLORS };
export const radii: typeof STOCK_RADII = { ...STOCK_RADII };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const motion = {
  quick: 180,
  standard: 280,
  slow: 520,
  spring: { damping: 18, stiffness: 230, mass: 0.8 },
} as const;

const rgb = (triplet: string | undefined, alpha?: number) => {
  const value = (triplet || '0 0 0').split(' ').join(', ');
  return alpha === undefined ? `rgb(${value})` : `rgba(${value}, ${alpha})`;
};

const average = (a: string | undefined, b: string | undefined) => {
  const left = (a || '0 0 0').split(' ').map(Number);
  const right = (b || '0 0 0').split(' ').map(Number);
  return left.map((value, index) => Math.round((value + right[index]!) / 2)).join(' ');
};

/** The app's color tokens for a theme (pure; used for previews too). */
export function themeColors(look: ThemeAppearance, hasBackdrop: boolean): Record<ThemeColorName, string> {
  let next: Record<ThemeColorName, string> = { ...STOCK_COLORS };

  if (!isDefaultThemeColors(look)) {
    const vars = buildThemeVariables(look);
    const light = themeScheme(look.background) === 'light';
    next = {
      ...next,
      canvas: rgb(vars['--gt-zinc-950']),
      canvasRaised: rgb(average(vars['--gt-zinc-950'], vars['--gt-zinc-900'])),
      surface: rgb(vars['--gt-zinc-900']),
      surfaceStrong: rgb(vars['--gt-zinc-800']),
      border: rgb(vars['--gt-white'], 0.09),
      borderStrong: rgb(vars['--gt-primary-500'], 0.25),
      text: rgb(vars['--gt-zinc-50']),
      textMuted: rgb(vars['--gt-zinc-400']),
      textDim: rgb(vars['--gt-zinc-500']),
      accent: rgb(vars['--gt-primary-600']),
      accentBright: rgb(vars['--gt-primary-500']),
      accentDark: rgb(vars['--gt-primary-900']),
      onAccent: rgb(vars['--gt-on-primary']),
      highlight: rgb(vars['--gt-accent-500']),
      onHighlight: rgb(vars['--gt-on-accent']),
      onText: rgb(vars['--gt-zinc-950']),
      // Status colors keep their meaning but darken to stay legible on light pages.
      gilid: light ? '#0891B2' : STOCK_COLORS.gilid,
      success: light ? '#059669' : STOCK_COLORS.success,
      warning: light ? '#B45309' : STOCK_COLORS.warning,
      danger: light ? '#B91C1C' : STOCK_COLORS.danger,
    };
  }
  next.screen = hasBackdrop ? 'transparent' : next.canvas;
  return next;
}

/** Rewrites the live tokens for a theme. Returns true when anything changed. */
export function applyThemeTokens(look: ThemeAppearance, hasBackdrop: boolean): boolean {
  const before = JSON.stringify([colors, radii]);
  Object.assign(colors, themeColors(look, hasBackdrop));
  const scale = THEME_CORNERS[look.style.corners] ?? 1;
  (Object.keys(STOCK_RADII) as (keyof typeof STOCK_RADII)[]).forEach((key) => {
    radii[key] = key === 'pill' ? STOCK_RADII.pill : Math.round(STOCK_RADII[key] * scale);
  });
  return JSON.stringify([colors, radii]) !== before;
}

// ---------- Theme-aware styles ----------

/** Changes with every theme change; ThemeProvider supplies it. */
export const ThemeVersionContext = createContext('');

export function useThemeVersion() {
  return useContext(ThemeVersionContext);
}

/**
 * Builds a stylesheet from the live tokens and rebuilds it when the theme
 * changes. Components call the returned hook, which also re-renders them on a
 * theme change so inline `colors.x` reads stay current:
 *
 *   const useStyles = makeStyles(() => ({ screen: { backgroundColor: colors.screen } }));
 *   function Screen() { const styles = useStyles(); ... }
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: () => T) {
  let cache: { version: string, styles: T } | null = null;
  return function useStyles(): T {
    const version = useThemeVersion();
    if (!cache || cache.version !== version) cache = { version, styles: StyleSheet.create(factory()) };
    return cache.styles;
  };
}

/** A token (hex or rgb()) with an alpha channel, e.g. withAlpha(colors.text, 0.08). */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const value = parseInt(hex[1]!, 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return rgb ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})` : color;
}

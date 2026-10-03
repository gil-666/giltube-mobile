export const colors = {
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
  gilid: '#22D3EE',
  success: '#34D399',
  warning: '#FBBF24',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const motion = {
  quick: 180,
  standard: 280,
  slow: 520,
  spring: { damping: 18, stiffness: 230, mass: 0.8 },
} as const;

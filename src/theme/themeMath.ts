// Kept in sync with giltube-frontend/app/utils/theme.ts: the same theme math
// and validation as the website, so a theme looks the same in the app.
// (The file-format helpers are unused here but kept so the two copies stay
// a straight diff of each other.)

// Site themes are three colors plus optional style choices. Everything else -
// the neutral surface scale, the primary and accent palettes, readable text on
// top of each - is derived here and exposed as CSS variables holding "R G B"
// triplets, which the Tailwind palettes in nuxt.config.ts read
// (zinc/gray/white/blue/primary/accent). The default theme emits no variables
// at all: assets/css/theme.css holds the original design values, so the stock
// look never depends on this math.
//
// Style values are enums and bounded numbers mirrored from the backend
// (internal/api/themes_style.go); they only ever select CSS this file writes,
// so a shared theme can't inject styles of its own.

export interface ThemeColors {
  primary: string
  accent: string
  background: string
}

export const THEME_FONTS = {
  inter: { family: "'Inter'", google: null },
  rounded: { family: "'Nunito'", google: 'Nunito:wght@400..800' },
  grotesk: { family: "'Space Grotesk'", google: 'Space+Grotesk:wght@400..700' },
  serif: { family: "'Lora'", google: 'Lora:wght@400..700' },
  mono: { family: "'JetBrains Mono'", google: 'JetBrains+Mono:wght@400..800' },
  pixel: { family: "'Pixelify Sans'", google: 'Pixelify+Sans:wght@400..700' },
} as const

export const THEME_CORNERS = { sharp: 0, default: 1, soft: 1.5, round: 2.25 } as const
// CSS particle effects, then animated backgrounds adapted from Vue Bits
// (app/components/themes/backgrounds). Both play behind the page.
export const THEME_PARTICLE_EFFECTS = ['snow', 'sparkles', 'bubbles', 'stars'] as const
export const THEME_ANIMATED_BACKGROUNDS = [
  'aurora', 'silk', 'iridescence', 'threads', 'waves', 'particles',
  'light-rays', 'plasma', 'ripple-grid', 'plasma-wave', 'balatro', 'gradient-waves',
] as const
export const THEME_EFFECTS = ['none', ...THEME_PARTICLE_EFFECTS, ...THEME_ANIMATED_BACKGROUNDS] as const
export const THEME_BACKGROUND_FITS = ['cover', 'tile'] as const
export const THEME_BACKGROUND_MAX_BLUR = 24
// Images sit behind the UI at a fixed strength so they tint the page without
// taking over the color scheme.
export const THEME_BACKGROUND_IMAGE_OPACITY = 0.4

export type ThemeFont = keyof typeof THEME_FONTS
export type ThemeCorners = keyof typeof THEME_CORNERS
export type ThemeEffect = (typeof THEME_EFFECTS)[number]
export type ThemeAnimatedBackground = (typeof THEME_ANIMATED_BACKGROUNDS)[number]

export const isAnimatedBackground = (effect: ThemeEffect): effect is ThemeAnimatedBackground =>
  (THEME_ANIMATED_BACKGROUNDS as readonly string[]).includes(effect)
export type ThemeBackgroundFit = (typeof THEME_BACKGROUND_FITS)[number]

export interface ThemeStyle {
  gradient_color: string
  gradient_angle: number
  background_fit: ThemeBackgroundFit
  background_blur: number
  corners: ThemeCorners
  font: ThemeFont
  effect: ThemeEffect
  // How strongly the effect shows over the background, in percent.
  effect_strength: number
}

export const DEFAULT_THEME_STYLE: ThemeStyle = {
  gradient_color: '',
  gradient_angle: 160,
  background_fit: 'cover',
  background_blur: 0,
  corners: 'default',
  font: 'inter',
  effect: 'none',
  effect_strength: 70,
}

// Everything that decides how the site looks.
export interface ThemeAppearance extends ThemeColors {
  style: ThemeStyle
  backgroundImage: string
}

export interface SiteTheme extends ThemeAppearance {
  id: string | null
  name: string
  version: number
}

export const THEME_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

export const DEFAULT_THEME_COLORS: ThemeColors = {
  primary: '#e5252a',
  accent: '#2563eb',
  background: '#0c0c0e',
}

export const DEFAULT_APPEARANCE: ThemeAppearance = {
  ...DEFAULT_THEME_COLORS,
  style: DEFAULT_THEME_STYLE,
  backgroundImage: '',
}

export const DEFAULT_SITE_THEME: SiteTheme = {
  id: null,
  name: 'Default',
  version: 0,
  ...DEFAULT_APPEARANCE,
}

export const THEME_FILE_FORMAT = 'giltube-theme'
export const THEME_FILE_VERSION = 1
export const THEME_NAME_MAX_LENGTH = 40

type RGB = [number, number, number]

const HEX_PATTERN = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i

export const normalizeHex = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const match = value.trim().match(HEX_PATTERN)
  if (!match) return null
  let hex = match[1]!.toLowerCase()
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('')
  return `#${hex}`
}

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Math.round(Number(value))
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  (typeof value === 'string' && (allowed as readonly string[]).includes(value.toLowerCase()) ? value.toLowerCase() as T : fallback)

// Invalid or unknown fields fall back to their defaults one by one, so a file
// or cookie with a single bad value still keeps the rest of its style.
export const normalizeThemeStyle = (raw: unknown): ThemeStyle => {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    gradient_color: normalizeHex(value.gradient_color) || '',
    gradient_angle: clampInt(value.gradient_angle, 0, 359, DEFAULT_THEME_STYLE.gradient_angle),
    background_fit: oneOf(value.background_fit, THEME_BACKGROUND_FITS, DEFAULT_THEME_STYLE.background_fit),
    background_blur: clampInt(value.background_blur, 0, THEME_BACKGROUND_MAX_BLUR, DEFAULT_THEME_STYLE.background_blur),
    corners: oneOf(value.corners, Object.keys(THEME_CORNERS) as ThemeCorners[], DEFAULT_THEME_STYLE.corners),
    font: oneOf(value.font, Object.keys(THEME_FONTS) as ThemeFont[], DEFAULT_THEME_STYLE.font),
    effect: oneOf(value.effect, THEME_EFFECTS, DEFAULT_THEME_STYLE.effect),
    effect_strength: clampInt(value.effect_strength, 10, 100, DEFAULT_THEME_STYLE.effect_strength),
  }
}

// Background images come from our own upload endpoint, or are a local
// object URL while the editor previews a picked file. Nothing else is ever
// placed inside url(...).
const SERVER_BACKGROUND_PATTERN = /^\/api\/v1\/theme-backgrounds\/[A-Za-z0-9_-]+_(lg|sm)\.jpg$/
const PREVIEW_BACKGROUND_PATTERN = /^blob:https?:\/\/[A-Za-z0-9.:\[\]-]+\/[A-Za-z0-9-]+$/

export const safeBackgroundImage = (value: unknown, allowPreview = false): string => {
  if (typeof value !== 'string') return ''
  if (SERVER_BACKGROUND_PATTERN.test(value)) return value
  if (allowPreview && PREVIEW_BACKGROUND_PATTERN.test(value)) return value
  return ''
}

// The small variant feeds theme cards; local previews have only one size.
export const backgroundThumbnail = (url: string): string => url.replace(/_lg\.jpg$/, '_sm.jpg')

const hexToRgb = (hex: string): RGB => {
  const value = normalizeHex(hex) || '#000000'
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) as RGB
}

const mix = (from: RGB, to: RGB, amount: number): RGB => from.map((c, i) => c + (to[i]! - c) * amount) as RGB

// Blends two hex colors; amount 0 keeps a, 1 gives b.
export const mixHex = (a: string, b: string, amount: number): string =>
  `#${mix(hexToRgb(a), hexToRgb(b), amount).map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`

export const hexToUnitRgb = (hex: string): [number, number, number] => hexToRgb(hex).map(c => c / 255) as [number, number, number]

const triplet = (rgb: RGB): string => rgb.map(c => Math.round(Math.min(255, Math.max(0, c)))).join(' ')

const channelLuminance = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const isLightColor = (hex: string): boolean => relativeLuminance(hex) > 0.36

const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]
const LIGHT_INK: RGB = [250, 250, 251]
const DARK_INK: RGB = [12, 12, 14]

// How far each neutral step sits between the background (0) and the text
// ink (1). Measured from the original zinc scale so a near-black background
// reproduces the stock surfaces.
const NEUTRAL_MIX: Record<(typeof THEME_STEPS)[number], number> = {
  50: 1, 100: 0.966, 200: 0.9, 300: 0.79, 400: 0.6, 500: 0.403, 600: 0.26, 700: 0.164, 800: 0.097, 900: 0.042, 950: 0,
}

// The stock scale is slightly cool-tinted rather than a straight blend; keep
// that tint so backgrounds near the default stay close to the original look.
const STOCK_NEUTRALS: Record<(typeof THEME_STEPS)[number], RGB> = {
  50: [250, 250, 251], 100: [242, 242, 244], 200: [226, 226, 230], 300: [200, 200, 207], 400: [155, 155, 165], 500: [108, 108, 118],
  600: [74, 74, 82], 700: [51, 51, 57], 800: [35, 35, 40], 900: [22, 22, 26], 950: [12, 12, 14],
}
const NEUTRAL_TINT = Object.fromEntries(THEME_STEPS.map((step) => {
  const blend = mix(STOCK_NEUTRALS[950], STOCK_NEUTRALS[50], NEUTRAL_MIX[step])
  return [step, STOCK_NEUTRALS[step].map((c, i) => c - blend[i]!) as RGB]
})) as Record<(typeof THEME_STEPS)[number], RGB>

// Brand palettes keep the chosen color at 600, the step buttons use, and
// tint toward white or shade toward black around it.
const PALETTE_MIX: Record<(typeof THEME_STEPS)[number], [RGB, number]> = {
  50: [WHITE, 0.92], 100: [WHITE, 0.84], 200: [WHITE, 0.68], 300: [WHITE, 0.5], 400: [WHITE, 0.28], 500: [WHITE, 0.12],
  600: [WHITE, 0], 700: [BLACK, 0.18], 800: [BLACK, 0.34], 900: [BLACK, 0.48], 950: [BLACK, 0.66],
}

// Mirrors a step around 600 so the chosen color stays put: 500 <-> 700,
// 400 <-> 800, ..., and the outermost steps pair with each other.
const MIRROR_STEP_INDEX = [10, 9, 8, 8, 7, 7, 6, 5, 4, 3, 2]

const readableOn = (hex: string): RGB => (contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#0c0c0e') ? WHITE : DARK_INK)

export const themeScheme = (background: string): 'light' | 'dark' => (isLightColor(background) ? 'light' : 'dark')

export const buildThemeVariables = (colors: ThemeColors): Record<string, string> => {
  const background = hexToRgb(colors.background)
  const light = themeScheme(colors.background) === 'light'
  const ink = light ? DARK_INK : LIGHT_INK
  const vars: Record<string, string> = {}

  for (const step of THEME_STEPS) {
    const tint = NEUTRAL_TINT[step]
    vars[`--gt-zinc-${step}`] = triplet(mix(background, ink, NEUTRAL_MIX[step]).map((c, i) => c + tint[i]!) as RGB)
  }
  // "white" is the foreground: text, pills and translucent overlays.
  vars['--gt-white'] = triplet(light ? DARK_INK : WHITE)

  for (const [name, hex] of [['primary', colors.primary], ['accent', colors.accent]] as const) {
    const base = hexToRgb(hex)
    vars[`--gt-${name}`] = triplet(base)
    for (const [index, step] of THEME_STEPS.entries()) {
      // On light pages the scale runs the other way around the chosen color
      // (pale tints at the top, deep shades at the bottom), like the status hues.
      const source = light ? THEME_STEPS[MIRROR_STEP_INDEX[index]!]! : step
      const [target, amount] = PALETTE_MIX[source]
      vars[`--gt-${name}-${step}`] = triplet(mix(base, target, amount))
    }
    vars[`--gt-on-${name}`] = triplet(readableOn(hex))
  }
  return vars
}

export const isDefaultThemeColors = (colors: ThemeColors): boolean =>
  (Object.keys(DEFAULT_THEME_COLORS) as (keyof ThemeColors)[]).every(key => normalizeHex(colors[key]) === DEFAULT_THEME_COLORS[key])

// A backdrop replaces the flat page color: a gradient, an image, or an effect
// layer that needs the page roots to be see-through.
export const themeHasBackdrop = (look: ThemeAppearance): boolean =>
  !!look.style.gradient_color || !!safeBackgroundImage(look.backgroundImage, true) || look.style.effect !== 'none'

export const buildStyleVariables = (look: ThemeAppearance): Record<string, string> => {
  const style = look.style
  const vars: Record<string, string> = {}
  if (style.corners !== 'default') vars['--gt-radius-scale'] = String(THEME_CORNERS[style.corners])
  if (style.font !== 'inter') vars['--gt-font'] = THEME_FONTS[style.font].family
  if (themeHasBackdrop(look)) {
    const background = normalizeHex(look.background) || DEFAULT_THEME_COLORS.background
    const gradient = normalizeHex(style.gradient_color)
    vars['--gt-backdrop'] = gradient ? `linear-gradient(${style.gradient_angle}deg,${background},${gradient})` : background
    const image = safeBackgroundImage(look.backgroundImage, true)
    if (image) {
      vars['--gt-backdrop-image'] = `url("${image}")`
      vars['--gt-backdrop-size'] = style.background_fit === 'tile' ? '480px auto' : 'cover'
      vars['--gt-backdrop-repeat'] = style.background_fit === 'tile' ? 'repeat' : 'no-repeat'
      vars['--gt-backdrop-blur'] = `${style.background_blur}px`
    }
  }
  return vars
}

// CSS injected for a non-default theme. Scheme-dependent native controls, the
// backdrop layers and the media scope (video players, artwork overlays) are
// handled in theme.css.
export const buildThemeCss = (look: ThemeAppearance): string => {
  const vars = {
    ...(isDefaultThemeColors(look) ? {} : buildThemeVariables(look)),
    ...buildStyleVariables(look),
  }
  if (!Object.keys(vars).length) return ''
  const body = Object.entries(vars).map(([key, value]) => `${key}:${value};`).join('')
  return `html:root{${body}color-scheme:${themeScheme(look.background)};}`
}

export const themeFontStylesheet = (style: ThemeStyle): string | null => {
  const google = THEME_FONTS[style.font].google
  return google ? `https://fonts.googleapis.com/css2?family=${google}&display=swap` : null
}

export const themeColorsOf = (theme: { primary_color: string, accent_color: string, background_color: string }): ThemeColors => ({
  primary: normalizeHex(theme.primary_color) || DEFAULT_THEME_COLORS.primary,
  accent: normalizeHex(theme.accent_color) || DEFAULT_THEME_COLORS.accent,
  background: normalizeHex(theme.background_color) || DEFAULT_THEME_COLORS.background,
})

export const themeAppearanceOf = (theme: {
  primary_color: string
  accent_color: string
  background_color: string
  style?: unknown
  background_image?: string
}): ThemeAppearance => ({
  ...themeColorsOf(theme),
  style: normalizeThemeStyle(theme.style),
  backgroundImage: safeBackgroundImage(theme.background_image),
})

export const lowContrastWarnings = (colors: ThemeColors): Array<'primary' | 'accent'> => {
  const warnings: Array<'primary' | 'accent'> = []
  if (contrastRatio(colors.primary, colors.background) < 1.6) warnings.push('primary')
  if (contrastRatio(colors.accent, colors.background) < 1.6) warnings.push('accent')
  return warnings
}

// ---------- Theme files ----------

export interface ThemeFile {
  format: typeof THEME_FILE_FORMAT
  version: number
  name: string
  colors: ThemeColors
  style?: ThemeStyle
  // The background embedded as a data: URL so the file is self-contained.
  background_image?: string
  source?: string
}

export interface ParsedThemeFile {
  name: string
  colors: ThemeColors
  style: ThemeStyle
  backgroundImage: Blob | null
  sourceCode: string | null
}

const DATA_IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/
const MAX_EMBEDDED_IMAGE_BYTES = 16 * 1024 * 1024

const dataUrlToBlob = (value: unknown): Blob | null => {
  if (typeof value !== 'string' || value.length > MAX_EMBEDDED_IMAGE_BYTES * 1.4) return null
  const match = value.match(DATA_IMAGE_PATTERN)
  if (!match) return null
  try {
    const binary = atob(match[2]!)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: `image/${match[1]}` })
  } catch {
    return null
  }
}

export const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

export const themeShareCodeFromUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const match = value.match(/\/themes\/([A-Za-z0-9]{6,32})(?:[/?#]|$)/)
  return match ? match[1]! : null
}

export const serializeThemeFile = (
  name: string,
  look: ThemeColors & { style?: ThemeStyle },
  options: { sourceUrl?: string, backgroundDataUrl?: string } = {},
): string => {
  const file: ThemeFile = {
    format: THEME_FILE_FORMAT,
    version: THEME_FILE_VERSION,
    name,
    colors: { primary: look.primary, accent: look.accent, background: look.background },
    style: normalizeThemeStyle(look.style),
  }
  if (options.backgroundDataUrl) file.background_image = options.backgroundDataUrl
  if (options.sourceUrl) file.source = options.sourceUrl
  return `${JSON.stringify(file, null, 2)}\n`
}

export const themeFileName = (name: string): string => {
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'theme'}.giltheme.json`
}

export const clampThemeName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, THEME_NAME_MAX_LENGTH)

// Accepts the export format, plus a flat {name, primary, accent, background}
// or API-shaped {primary_color, ...} object so hand-written files work too.
export const parseThemeFile = (text: string): ParsedThemeFile | null => {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  if (data.format && data.format !== THEME_FILE_FORMAT) return null
  if (typeof data.version === 'number' && data.version > THEME_FILE_VERSION) return null

  const source = data.colors && typeof data.colors === 'object' ? data.colors : data
  const primary = normalizeHex(source.primary ?? source.primary_color)
  const accent = normalizeHex(source.accent ?? source.accent_color)
  const background = normalizeHex(source.background ?? source.background_color)
  if (!primary || !accent || !background) return null

  return {
    name: clampThemeName(typeof data.name === 'string' ? data.name : '') || 'Imported theme',
    colors: { primary, accent, background },
    style: normalizeThemeStyle(data.style),
    backgroundImage: dataUrlToBlob(data.background_image),
    sourceCode: themeShareCodeFromUrl(data.source),
  }
}


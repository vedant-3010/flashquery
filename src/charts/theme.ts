import type { ChartPalette } from '@/charts/spec'

// Chart colors for light and dark mode (ui rules: colour-blind-safe; never color alone). Hex, not
// the app's oklch tokens, because ECharts can't parse oklch. Switching theme re-renders the option;
// the data stays (F-SHELL-04). Palettes (F-VIZ-12) are checked in src/lib/contrast.test.ts (marks
// ≥ 3:1 on the card) and src/lib/colorVision.test.ts (distinct under every kind of dichromacy).

export interface ChartTheme {
  mode: 'light' | 'dark'
  palette: string[]
  /** The "Other" series and slices. */
  other: string
  text: string
  muted: string
  grid: string
  axis: string
  /** The card behind the chart (PNG export background). */
  background: string
  tooltipBackground: string
  tooltipBorder: string
  /** Heatmaps, calendars and treemap depth, low → high. */
  sequential: string[]
  /** Waterfall steps up and down. */
  increase: string
  decrease: string
}

interface PaletteColors {
  series: string[]
  other: string
  sequential: string[]
  increase: string
  decrease: string
}

/** Viridis: perceptually even, readable in both modes and in grayscale. */
const VIRIDIS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']

export const PALETTES: Record<
  ChartPalette,
  { label: string; description: string; light: PaletteColors; dark: PaletteColors }
> = {
  flashquery: {
    label: 'flashQuery',
    description: 'Violet-led, tuned to stay distinct for every kind of colour blindness.',
    // Found by a search that keeps each pair apart under simulated protan, deutan and tritan vision.
    light: {
      series: ['#7C1CCD', '#8D5423', '#348B6D', '#3997E2', '#CA328C', '#987A15', '#494F59'],
      other: '#7D828C',
      sequential: ['#FCE0FF', '#D5B9FF', '#A689F1', '#795BBF', '#4B2888'],
      increase: '#348B6D',
      decrease: '#CA328C',
    },
    dark: {
      series: ['#9B6BFF', '#E0975C', '#4FD6AA', '#3BB0F2', '#F25AA3', '#D9B41A', '#C9D2DE'],
      other: '#737373',
      sequential: ['#370C6F', '#553494', '#795BBF', '#A689F1', '#DFC3FF'],
      increase: '#4FD6AA',
      decrease: '#F25AA3',
    },
  },
  tol: {
    label: 'Tol bright',
    description: "Paul Tol's colour-blind-safe scheme.",
    // On white, Tol's yellow, cyan and grey fall below 3:1, so light mode uses darker shades.
    light: {
      series: ['#4477AA', '#EE6677', '#228833', '#997700', '#1F86A6', '#AA3377', '#808080'],
      other: '#7D828C',
      sequential: VIRIDIS,
      increase: '#4477AA',
      decrease: '#EE6677',
    },
    dark: {
      series: ['#6699CC', '#EE6677', '#44AA55', '#CCBB44', '#66CCEE', '#CC5599', '#BBBBBB'],
      other: '#737373',
      sequential: VIRIDIS,
      increase: '#6699CC',
      decrease: '#EE6677',
    },
  },
  okabe: {
    label: 'Okabe–Ito',
    description: 'The classic colour-blind-safe set (darkened on white for contrast).',
    light: {
      series: ['#4587DF', '#CE5D46', '#48A073', '#876114', '#206E89', '#6B2B5A', '#958812'],
      other: '#7D828C',
      sequential: VIRIDIS,
      increase: '#4587DF',
      decrease: '#CE5D46',
    },
    dark: {
      series: ['#56B4E9', '#E69F00', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'],
      other: '#737373',
      sequential: VIRIDIS,
      increase: '#56B4E9',
      decrease: '#D55E00',
    },
  },
  mono: {
    label: 'Mono',
    description: 'Shades of one violet, told apart by lightness: calm, for one or two series.',
    // Alternating dark and light, so neighbouring series differ the most.
    light: {
      series: ['#4D2090', '#8C69DD', '#390077', '#7853C5', '#623BAB'],
      other: '#7D828C',
      sequential: ['#FCE0FF', '#D5B9FF', '#A689F1', '#795BBF', '#4B2888'],
      increase: '#4D2090',
      decrease: '#8C69DD',
    },
    dark: {
      series: ['#C1A7FF', '#9076D4', '#F5DBFF', '#A88EEF', '#DBC1FF'],
      other: '#737373',
      sequential: ['#370C6F', '#553494', '#795BBF', '#A689F1', '#DFC3FF'],
      increase: '#C1A7FF',
      decrease: '#9076D4',
    },
  },
}

export const DEFAULT_PALETTE: ChartPalette = 'flashquery'

const SURFACES = {
  light: {
    text: '#171717',
    muted: '#737373',
    grid: '#e8e8e8',
    axis: '#d4d4d4',
    background: '#ffffff',
    tooltipBackground: '#ffffff',
    tooltipBorder: '#e5e5e5',
  },
  dark: {
    text: '#fafafa',
    muted: '#a3a3a3',
    grid: '#2a2a2a',
    axis: '#404040',
    background: '#171717',
    tooltipBackground: '#1f1f1f',
    tooltipBorder: '#3a3a3a',
  },
} as const

export function chartTheme(
  mode: 'light' | 'dark',
  palette: ChartPalette = DEFAULT_PALETTE,
): ChartTheme {
  const colors = PALETTES[palette][mode]
  return {
    mode,
    ...SURFACES[mode],
    palette: colors.series,
    other: colors.other,
    sequential: colors.sequential,
    increase: colors.increase,
    decrease: colors.decrease,
  }
}

/** The default palette's themes (exports and tests that don't pick one). */
export const LIGHT_THEME: ChartTheme = chartTheme('light')
export const DARK_THEME: ChartTheme = chartTheme('dark')

/** Line series also differ by marker shape, so they can be told apart without color. */
export const SYMBOLS = ['circle', 'rect', 'triangle', 'diamond', 'roundRect', 'pin', 'arrow']

export const FONT_FAMILY = "'Geist Variable', ui-sans-serif, system-ui, sans-serif"

/** '#RRGGBB' with an alpha, for gradients and soft fills. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

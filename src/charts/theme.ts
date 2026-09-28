// Chart colors for light and dark mode (ui rules: colour-blind-safe; never color alone). Hex, not
// the app's oklch tokens, because ECharts can't parse oklch. Switching theme re-renders the option;
// the data stays (F-SHELL-04).

export interface ChartTheme {
  mode: 'light' | 'dark'
  /** Paul Tol's "bright" qualitative scheme: distinguishable with common color-vision deficiencies. */
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
  /** Heatmap scale, low → high (viridis): readable in both modes and in grayscale. */
  sequential: string[]
}

const PALETTE = ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB']
const VIRIDIS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']

export const LIGHT_THEME: ChartTheme = {
  mode: 'light',
  palette: PALETTE,
  other: '#9ca3af',
  text: '#171717',
  muted: '#737373',
  grid: '#e5e5e5',
  axis: '#a3a3a3',
  background: '#ffffff',
  tooltipBackground: '#ffffff',
  tooltipBorder: '#e5e5e5',
  sequential: VIRIDIS,
}

export const DARK_THEME: ChartTheme = {
  mode: 'dark',
  palette: ['#6699CC', '#EE6677', '#44AA55', '#CCBB44', '#66CCEE', '#CC5599', '#BBBBBB'],
  other: '#737373',
  text: '#fafafa',
  muted: '#a3a3a3',
  grid: '#2e2e2e',
  axis: '#525252',
  background: '#171717',
  tooltipBackground: '#262626',
  tooltipBorder: '#404040',
  sequential: VIRIDIS,
}

export const chartTheme = (mode: 'light' | 'dark'): ChartTheme =>
  mode === 'dark' ? DARK_THEME : LIGHT_THEME

/** Line series also differ by marker shape, so they can be told apart without color. */
export const SYMBOLS = ['circle', 'rect', 'triangle', 'diamond', 'roundRect', 'pin', 'arrow']

export const FONT_FAMILY = "'Geist Variable', ui-sans-serif, system-ui, sans-serif"

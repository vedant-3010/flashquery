// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ChartPaletteSchema } from '@/charts/spec'
import { chartTheme, DARK_THEME, LIGHT_THEME } from '@/charts/theme'
import { contrast } from './contrast'

// F-A11Y-02: WCAG AA contrast in both themes, checked on the real tokens. Text needs 4.5:1; chart
// marks (non-text, WCAG 1.4.11) need 3:1 against the card they sit on.

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

function tokens(selector: ':root' | '.dark'): Record<string, string> {
  const block =
    new RegExp(`^${selector.replace('.', '\\.')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? ''
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]),
  )
}

const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
  ['destructive', 'background'],
  ['sidebar-foreground', 'sidebar'],
]

describe.each([
  ['light', ':root', LIGHT_THEME],
  ['dark', '.dark', DARK_THEME],
] as const)('%s theme', (_, selector, chart) => {
  const t = tokens(selector)

  it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(t[fg] ?? '', t[bg] ?? '')).toBeGreaterThanOrEqual(4.5)
  })

  it('chart text is at least 4.5:1 and every series color at least 3:1', () => {
    expect(contrast(chart.text, chart.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(chart.muted, chart.background)).toBeGreaterThanOrEqual(4.5)
    for (const color of [...chart.palette, chart.other]) {
      expect(contrast(color, chart.background), color).toBeGreaterThanOrEqual(3)
    }
  })
})

describe.each(ChartPaletteSchema.options)('%s palette (F-VIZ-12)', (palette) => {
  it.each(['light', 'dark'] as const)('every mark is at least 3:1 on the %s card', (mode) => {
    const theme = chartTheme(mode, palette)
    const marks = [...theme.palette, theme.other, theme.increase, theme.decrease]
    for (const color of marks) {
      expect(contrast(color, theme.background), color).toBeGreaterThanOrEqual(3)
    }
  })
})

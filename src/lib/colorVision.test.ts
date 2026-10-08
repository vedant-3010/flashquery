// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ChartPaletteSchema } from '@/charts/spec'
import { chartTheme, DEFAULT_PALETTE } from '@/charts/theme'
import { closestPair, deltaE, simulate, type Vision } from './colorVision'

// F-VIZ-12 / ui rules: palettes stay distinguishable with each kind of colour blindness. ΔE is
// CIE76 in CIELAB; Tol bright, the long-standing colour-blind-safe scheme, sets the floor (≥ 6).

const VISIONS: Vision[] = ['normal', 'protan', 'deutan', 'tritan']

describe('colour vision', () => {
  it('simulates dichromacy: red and green collapse for deutans, not for others', () => {
    expect(deltaE('#ff0000', '#00ff00')).toBeGreaterThan(80)
    expect(deltaE('#cc3333', '#669900', 'deutan')).toBeLessThan(deltaE('#cc3333', '#669900'))
    expect(simulate([0.5, 0.5, 0.5], 'protan').every((v) => Math.abs(v - 0.5) < 0.01)).toBe(true)
  })

  describe.each(ChartPaletteSchema.options)('%s palette', (palette) => {
    it.each(['light', 'dark'] as const)('stays distinct in %s mode for every vision', (mode) => {
      const { palette: colors } = chartTheme(mode, palette)
      for (const vision of VISIONS) {
        const pair = closestPair(colors, vision)
        expect(pair.deltaE, `${vision}: ${pair.a} vs ${pair.b}`).toBeGreaterThanOrEqual(6)
      }
    })
  })

  it('the default palette keeps a wide margin (≥ 12) for every vision', () => {
    for (const mode of ['light', 'dark'] as const) {
      const { palette: colors } = chartTheme(mode, DEFAULT_PALETTE)
      for (const vision of VISIONS) {
        expect(closestPair(colors, vision).deltaE).toBeGreaterThanOrEqual(12)
      }
    }
  })
})

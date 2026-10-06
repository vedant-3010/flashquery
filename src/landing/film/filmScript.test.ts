import { describe, expect, it } from 'vitest'
import { FILM, FINAL_T, frameAt } from './filmScript'

const options = { rows: 1_000_000, questionLength: 26, sqlLineCount: 14, barCount: 5 }

describe('hero film timeline (PRD D99)', () => {
  it('starts empty', () => {
    expect(frameAt(0, options)).toMatchObject({
      fileIn: 0,
      rows: 0,
      typed: 0,
      asked: false,
      stepsDone: 0,
      stepRunning: -1,
      sqlLines: 0,
      tab: 'chart',
      headline: false,
      opacity: 1,
    })
  })

  it('loads rows, types, runs the steps, shows SQL, then the chart', () => {
    expect(frameAt(FILM.load.end, options).rows).toBe(1_000_000)
    expect(frameAt((FILM.type.start + FILM.type.end) / 2, options).typed).toBe(13)
    const running = frameAt(FILM.steps.start + 10, options)
    expect(running).toMatchObject({ asked: true, stepsDone: 0, stepRunning: 0 })
    expect(frameAt(FILM.sql.start + 10, options)).toMatchObject({ stepsDone: 4, tab: 'sql' })
    expect(frameAt(FILM.sql.end, options).sqlLines).toBe(14)
    expect(frameAt(FILM.chart.start, options).tab).toBe('chart')
  })

  it('ends on a complete still frame, and loops', () => {
    const final = frameAt(FINAL_T, options)
    expect(final).toMatchObject({
      rows: 1_000_000,
      typed: 26,
      stepsDone: 4,
      sqlLines: 14,
      headline: true,
    })
    expect(final.bars.every((bar) => Math.abs(bar - 1) < 1e-9)).toBe(true)
    expect(frameAt(FILM.length + 10, options).rows).toBe(0)
    expect(frameAt(FILM.fade.end - 1, options).opacity).toBeLessThan(0.01)
  })

  it('grows bars with a small overshoot, staggered', () => {
    const mid = frameAt(FILM.chart.start + 400, options)
    expect(mid.bars[0]).toBeGreaterThan(mid.bars[4] ?? 1)
    const peak = Math.max(
      ...Array.from(
        { length: 40 },
        (_, i) => frameAt(FILM.chart.start + i * 25, options).bars[0] ?? 0,
      ),
    )
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.1)
  })
})

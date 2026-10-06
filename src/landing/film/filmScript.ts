// The hero "film" (PRD D99): a miniature of the app answering the demo question, as a pure function
// of time. frameAt(t) gives everything the film draws at t ms, so the loop can pause, replay, and
// show its final frame still for people who prefer reduced motion.

const at = (start: number, end: number) => ({ start, end })

export const FILM = {
  drop: at(250, 950),
  load: at(950, 2250),
  type: at(2450, 4050),
  ask: 4200,
  steps: at(4350, 5850),
  sql: at(5950, 7150),
  chart: at(7350, 8350),
  headline: 8500,
  fade: at(13000, 13600),
  length: 13600,
} as const

/** A still frame with everything shown (reduced motion, and the hold before the loop restarts). */
export const FINAL_T = FILM.headline + 800

export interface Frame {
  /** 0 → 1: the file chip dropping into the window. */
  fileIn: number
  rows: number
  /** Characters of the question typed so far. */
  typed: number
  asked: boolean
  /** Pipeline steps finished, and the one running (−1 when none). */
  stepsDone: number
  stepRunning: number
  /** Lines of SQL shown. */
  sqlLines: number
  tab: 'chart' | 'sql'
  /** Each bar's growth, 0 → 1 (with a little overshoot, like a spring). */
  bars: number[]
  headline: boolean
  /** 1 → 0 at the end of the loop. */
  opacity: number
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const progress = (t: number, window: { start: number; end: number }) =>
  clamp((t - window.start) / (window.end - window.start))
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3
/** Overshoots by about 6% before settling, like a soft spring. */
const easeOutBack = (x: number) => {
  const c = 1.2
  return x === 0 ? 0 : 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2
}

export function frameAt(
  time: number,
  {
    rows,
    questionLength,
    sqlLineCount,
    barCount,
    steps = 4,
  }: {
    rows: number
    questionLength: number
    sqlLineCount: number
    barCount: number
    steps?: number
  },
): Frame {
  const t = ((time % FILM.length) + FILM.length) % FILM.length
  const stepLength = (FILM.steps.end - FILM.steps.start) / steps
  const stepClock = t - FILM.steps.start
  const stepsDone = stepClock < 0 ? 0 : Math.min(steps, Math.floor(stepClock / stepLength))
  const barWindow = FILM.chart.end - FILM.chart.start
  return {
    fileIn: easeOutCubic(progress(t, FILM.drop)),
    rows: Math.round(rows * easeOutCubic(progress(t, FILM.load))),
    typed: Math.floor(questionLength * progress(t, FILM.type)),
    asked: t >= FILM.ask,
    stepsDone,
    stepRunning: stepClock >= 0 && stepsDone < steps ? stepsDone : -1,
    sqlLines: Math.ceil(sqlLineCount * progress(t, FILM.sql)),
    tab: t >= FILM.sql.start && t < FILM.chart.start ? 'sql' : 'chart',
    bars: Array.from({ length: barCount }, (_, i) => {
      const start = FILM.chart.start + i * 90
      return easeOutBack(clamp((t - start) / (barWindow - (barCount - 1) * 90)))
    }),
    headline: t >= FILM.headline,
    opacity: 1 - progress(t, FILM.fade),
  }
}

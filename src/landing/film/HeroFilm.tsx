import { AnimatePresence, m, useInView, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { DEMO_QUESTION, GROWTH, ROWS } from '@/landing/data'
import { cx } from '@/landing/cx'
import { FilmBars } from '@/landing/film/FilmBars'
import { FilmMeter } from '@/landing/film/FilmMeter'
import { FilmPipeline } from '@/landing/film/FilmPipeline'
import { FilmSidebar } from '@/landing/film/FilmSidebar'
import { FilmSql, SQL_LINE_COUNT } from '@/landing/film/FilmSql'
import { frameAt } from '@/landing/film/filmScript'
import { useFilmClock } from '@/landing/film/useFilmClock'
import { SETTLE, SNAPPY } from '@/landing/motion'

const OPTIONS = {
  rows: ROWS,
  questionLength: DEMO_QUESTION.length,
  sqlLineCount: SQL_LINE_COUNT,
  barCount: GROWTH.length,
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

/**
 * The hero (PRD D99): a miniature of the app answering the demo question on 1,000,000 rows, with
 * the real SQL and the real numbers. It pauses off-screen, in a hidden tab, while hovered, and on
 * request (WCAG 2.2.2); with reduced motion it shows the finished answer.
 */
export function HeroFilm() {
  const reduced = useReducedMotion() ?? false
  const root = useRef<HTMLElement>(null)
  const inView = useInView(root, { amount: 0.3 })
  const pageVisible = usePageVisible()
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)
  // A tab the visitor picked: the film stops so they can look around.
  const [pickedTab, setPickedTab] = useState<'chart' | 'sql' | null>(null)
  // What the visitor asked for; hovering or scrolling away only pauses it for a moment.
  const wantsToPlay = playing && pickedTab === null
  const running = wantsToPlay && inView && pageVisible && !hovered
  const { time, replay } = useFilmClock({ running, reduced })
  const frame = useMemo(() => frameAt(time, OPTIONS), [time])
  const tab = pickedTab ?? frame.tab
  const typing = frame.typed > 0 && !frame.asked

  return (
    <figure
      ref={root}
      aria-label={`flashQuery answering “${DEMO_QUESTION}” on a 1,000,000-row file: APAC grew fastest, +140% from 2022 to 2025. The file is never uploaded.`}
      className="relative"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div
        className="@container overflow-hidden rounded-[14px] border border-hairline-strong bg-panel shadow-[0_1px_0_rgba(21,21,21,.04),0_30px_60px_-30px_rgba(21,21,21,.35),0_12px_24px_-16px_rgba(21,21,21,.18)]"
        style={{ opacity: reduced ? 1 : frame.opacity }}
      >
        {/* The app's own top bar, in miniature. */}
        <div className="flex h-9 items-center gap-2 border-b border-hairline px-3 text-[11px]">
          <BrandMark className="size-3.5 text-ink" />
          <span className="font-medium text-ink">flashQuery</span>
          <span className="text-ink-faint">/ Workspace</span>
          <span className="ml-auto rounded-full border border-hairline px-2 py-px text-[10px] text-ink-muted">
            Balanced
          </span>
          <span className="flex items-center gap-1 rounded-full border border-hairline px-2 py-px text-[10px] text-ink-muted">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden />
            Engine ready
          </span>
        </div>

        <div className="flex h-[440px]">
          <FilmSidebar frame={frame} />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <AnimatePresence>
                {frame.asked && (
                  <m.p
                    key="question"
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={SNAPPY}
                    className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-ink px-3 py-1.5 text-[11.5px] text-paper"
                  >
                    {DEMO_QUESTION}
                  </m.p>
                )}
              </AnimatePresence>

              {frame.asked ? (
                <div className="grid min-h-0 gap-2.5 rounded-xl border border-hairline bg-paper/70 p-3">
                  <FilmPipeline frame={frame} />
                  <p
                    className={cx(
                      'text-[12.5px] font-medium text-ink transition-all duration-500',
                      frame.headline ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
                    )}
                  >
                    APAC leads with <span className="text-accent-ink">+140%</span>, followed by
                    LATAM (+66%).
                  </p>
                  <div className="flex gap-3 border-b border-hairline text-[10.5px]" role="tablist">
                    {(['chart', 'sql'] as const).map((id) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        onClick={() => setPickedTab(id)}
                        className={cx(
                          'relative pb-1.5 transition-colors',
                          tab === id ? 'text-ink' : 'text-ink-faint hover:text-ink-muted',
                        )}
                      >
                        {id === 'chart' ? 'Chart' : 'SQL'}
                        {tab === id && (
                          <m.span
                            layoutId="film-tab"
                            className="absolute inset-x-0 -bottom-px h-px bg-ink"
                            transition={SNAPPY}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-[178px]">
                    {tab === 'sql' ? (
                      <FilmSql lines={pickedTab ? SQL_LINE_COUNT : frame.sqlLines} />
                    ) : (
                      <FilmBars
                        frame={pickedTab ? { ...frame, bars: GROWTH.map(() => 1) } : frame}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid flex-1 place-items-center text-center">
                  <p
                    className="max-w-[16rem] text-[11.5px] text-ink-faint transition-opacity duration-500"
                    style={{ opacity: frame.rows >= ROWS ? 1 : 0.4 }}
                  >
                    {frame.rows >= ROWS
                      ? 'Ask anything about sales.csv. It stays on this device.'
                      : 'Load a file to start.'}
                  </p>
                </div>
              )}
            </div>

            {/* The composer: the question types itself, then clears. */}
            <div className="mx-4 mb-3 flex h-9 items-center gap-2 rounded-xl border border-hairline-strong bg-paper px-3 text-[11.5px]">
              <span
                className={cx('min-w-0 flex-1 truncate', typing ? 'text-ink' : 'text-ink-faint')}
              >
                {typing ? DEMO_QUESTION.slice(0, frame.typed) : 'Ask a question about your data…'}
                {typing && (
                  <span className="caret ml-px inline-block h-3 w-px bg-ink align-middle" />
                )}
              </span>
              <m.span
                animate={{ scale: typing ? 1 : 0.92, opacity: typing ? 1 : 0.45 }}
                transition={SETTLE}
                className="grid size-6 place-items-center rounded-lg bg-ink text-paper"
                aria-hidden
              >
                <svg viewBox="0 0 12 12" className="size-3">
                  <path
                    d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </m.span>
            </div>
          </div>
        </div>

        <FilmMeter asked={frame.asked} />
      </div>

      <figcaption className="mt-3 flex items-center gap-2 font-mono text-[10.5px] text-ink-muted">
        {!reduced && (
          <>
            <button
              type="button"
              onClick={() => {
                if (wantsToPlay) {
                  setPlaying(false)
                } else {
                  setPickedTab(null)
                  setPlaying(true)
                }
              }}
              className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 transition-colors hover:border-ink-faint hover:text-ink"
            >
              {wantsToPlay ? (
                <Pause className="size-3" aria-hidden />
              ) : (
                <Play className="size-3" aria-hidden />
              )}
              {wantsToPlay ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPickedTab(null)
                setPlaying(true)
                replay()
              }}
              className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 transition-colors hover:border-ink-faint hover:text-ink"
            >
              <RotateCcw className="size-3" aria-hidden />
              Replay
            </button>
          </>
        )}
        <span className="ml-auto min-w-0 text-right">
          Real query, real numbers: the 1M-row sample.
        </span>
      </figcaption>
    </figure>
  )
}

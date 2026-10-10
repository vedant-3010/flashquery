import { ArrowRight, Pause, Play, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ANSWER_EXAMPLES } from '@/features/account/answerExamples'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

// The sign-in pages' moving part (D115): questions type themselves into an ask bar and their answers
// assemble, card by card. Its own scene, not the landing's film, animated in CSS (index.css,
// .auth-*). Decorative; pausable (WCAG 2.2.2), still in a hidden tab, and one finished answer with
// reduced motion.

const TYPE_MS = 45
const THINK_MS = 650
const HOLD_MS = 3200

type Phase = 'typing' | 'thinking' | 'answer'

function usePageVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

const CARD = 'rounded-2xl border border-paper/12 bg-paper/[0.04] p-4'
const LABEL = 'font-mono text-[10.5px] tracking-[0.08em] text-paper/55 uppercase'

export function AnswerLoop() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const visible = usePageVisible()
  const [paused, setPaused] = useState(false)
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const running = !reduced && !paused && visible
  const example = ANSWER_EXAMPLES[index] ?? ANSWER_EXAMPLES[0]
  const question = example?.question ?? ''
  // With reduced motion: the first answer, finished and still.
  const shownTyped = reduced ? question.length : typed
  const shownPhase: Phase = reduced ? 'answer' : phase

  useEffect(() => {
    if (!running) return
    const step =
      phase === 'typing'
        ? typed < question.length
          ? () => setTyped(typed + 1)
          : () => setPhase('thinking')
        : phase === 'thinking'
          ? () => setPhase('answer')
          : () => {
              setIndex((index + 1) % ANSWER_EXAMPLES.length)
              setTyped(0)
              setPhase('typing')
            }
    const delay = phase === 'typing' ? TYPE_MS : phase === 'thinking' ? THINK_MS : HOLD_MS
    const timer = window.setTimeout(step, delay)
    return () => window.clearTimeout(timer)
  }, [running, phase, typed, index, question.length])

  if (!example) return null
  const top = Math.max(...example.bars.map((bar) => bar.value))
  const answered = shownPhase === 'answer'

  return (
    <div className={cn('grid gap-3', !running && 'auth-paused')}>
      <div aria-hidden className="grid gap-3">
        {/* The ask bar. */}
        <div className="flex h-12 items-center gap-3 rounded-full border border-paper/15 bg-paper/[0.06] pr-1.5 pl-4 text-[15px]">
          <Sparkles className="size-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-paper">
            {question.slice(0, shownTyped)}
            {shownPhase === 'typing' && <span className="caret ml-px text-accent">|</span>}
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-paper text-ink">
            <ArrowRight className="size-4" />
          </span>
        </div>

        <div className="grid min-h-[236px] gap-3 sm:grid-cols-[1.6fr_1fr]">
          {/* The answer: a bar chart that grows in. */}
          <div className={cn(CARD, 'flex flex-col')}>
            <div className={cn(LABEL, 'mb-3 flex items-center justify-between')}>
              <span>Answer</span>
              <span>
                {answered ? 'DuckDB · 23 ms' : shownPhase === 'thinking' ? 'Writing SQL…' : '—'}
              </span>
            </div>
            {answered && (
              <ul key={index} className="grid gap-2.5">
                {example.bars.map((bar, i) => (
                  <li
                    key={bar.label}
                    className="auth-fade-up grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3 text-[12.5px]"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <span className={i === 0 ? 'text-paper' : 'text-paper/65'}>{bar.label}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-paper/[0.07]">
                      <span
                        className={cn(
                          'auth-grow block h-full rounded-full',
                          i === 0 ? 'bg-accent' : 'bg-paper/30',
                        )}
                        style={{
                          width: `${(bar.value / top) * 100}%`,
                          animationDelay: `${i * 80}ms`,
                        }}
                      />
                    </span>
                    <span className="text-right font-mono text-paper/75 tabular-nums">
                      {bar.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-auto pt-3 font-mono text-[10.5px] text-paper/45">
              sales.csv · 1,000,000 rows · on this device
            </p>
          </div>

          <div className="grid content-start gap-3">
            {/* The headline number. */}
            <div className={cn(CARD, 'auth-float')}>
              <p className={LABEL}>Headline</p>
              <div key={answered ? index : 'waiting'} className="auth-fade-up">
                <p className="mt-2 font-serif text-[40px] leading-none text-accent italic">
                  {answered ? example.kpi.value : '…'}
                </p>
                <p className="mt-1.5 text-[12.5px] text-paper/65">
                  {answered ? example.kpi.label : 'Working on it'}
                </p>
              </div>
            </div>
            {/* What left the browser: nothing but the schema. */}
            <div className={cn(CARD, 'auth-float')} style={{ animationDelay: '-3s' }}>
              <p className={LABEL}>Uploaded</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-mono text-[15px] text-paper">0 bytes</span>
                <svg viewBox="0 0 60 8" className="h-2 flex-1 text-paper/35">
                  <line
                    x1="0"
                    y1="4"
                    x2="60"
                    y2="4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="flow-dash"
                  />
                </svg>
              </div>
              <p className="mt-1.5 text-[12.5px] text-paper/65">Rows stay in this tab.</p>
            </div>
          </div>
        </div>
      </div>
      {!reduced && (
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          className="flex w-fit items-center gap-1.5 rounded-full border border-paper/15 px-2.5 py-1 text-[12px] text-paper/70 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
        >
          {paused ? (
            <Play className="size-3" aria-hidden />
          ) : (
            <Pause className="size-3" aria-hidden />
          )}
          {paused ? 'Play' : 'Pause'} animation
        </button>
      )}
    </div>
  )
}

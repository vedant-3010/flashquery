import { PIPELINE_STEPS } from '@/landing/data'
import type { Frame } from '@/landing/film/filmScript'
import { cx as cn } from '@/landing/cx'

const duration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`)

function Status({ state }: { state: 'pending' | 'running' | 'done' }) {
  if (state === 'running') {
    return (
      <span className="relative size-3 shrink-0" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-hairline-strong" />
        <span className="absolute inset-0 animate-spin rounded-full border border-transparent border-t-ink" />
      </span>
    )
  }
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
      <circle
        cx="6"
        cy="6"
        r="5.4"
        className={cn(
          'transition-all duration-300',
          state === 'done' ? 'fill-ok stroke-ok' : 'fill-transparent stroke-hairline-strong',
        )}
        strokeWidth="1.1"
      />
      <path
        d="M3.6 6.2 5.3 7.8 8.5 4.5"
        fill="none"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="8"
        strokeDashoffset={state === 'done' ? 0 : 8}
        className="transition-[stroke-dashoffset] delay-100 duration-300"
      />
    </svg>
  )
}

/** The answer's progress line, as in the app (F-ASK-06). */
export function FilmPipeline({ frame }: { frame: Frame }) {
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Progress">
      {PIPELINE_STEPS.map((step, i) => {
        const state = i < frame.stepsDone ? 'done' : i === frame.stepRunning ? 'running' : 'pending'
        return (
          <li
            key={step.label}
            className={cn(
              'flex items-center gap-1.5 text-[10.5px] transition-colors duration-300',
              state === 'pending' ? 'text-ink-faint' : 'text-ink-soft',
            )}
          >
            <Status state={state} />
            {step.label}
            <span
              className={cn(
                'tabular font-mono text-[9.5px] text-ink-faint transition-opacity duration-300',
                state === 'done' ? 'opacity-100' : 'opacity-0',
              )}
            >
              {duration(step.ms)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

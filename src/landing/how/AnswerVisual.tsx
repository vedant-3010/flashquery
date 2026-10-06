import { GROWTH, PIPELINE_STEPS } from '@/landing/data'

const MAX = Math.max(...GROWTH.map((g) => g.growth))

/** Step 4: the answer with its working: chart, why this chart, and the trace. */
export function AnswerVisual() {
  return (
    <div className="grid h-full content-center p-6">
      <div className="rounded-xl border border-hairline-strong bg-panel p-4">
        <p className="text-[13px] font-medium">APAC leads with +140%, followed by LATAM (+66%).</p>
        <ul className="mt-3 grid gap-1.5">
          {GROWTH.map((g, i) => (
            <li
              key={g.region}
              className="grid grid-cols-[76px_1fr] items-center gap-2 text-[10.5px]"
            >
              <span className="text-ink-soft">{g.region}</span>
              <span
                className={`h-2.5 rounded-[2px] ${i === 0 ? 'bg-accent' : 'bg-ink-soft/70'}`}
                style={{ width: `${(g.growth / MAX) * 100}%` }}
              />
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-hairline pt-2 text-[11px] text-ink-muted">
          <span className="font-medium text-ink">Why a bar chart:</span> one category, one measure,
          sorted by growth.
        </p>
        <ol className="mt-2 grid gap-0.5 font-mono text-[10px] text-ink-faint">
          {PIPELINE_STEPS.map((step) => (
            <li key={step.label} className="flex justify-between">
              <span>{step.label.toLowerCase()}</span>
              <span className="tabular">
                {step.ms >= 1000 ? `${(step.ms / 1000).toFixed(2)} s` : `${step.ms} ms`}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

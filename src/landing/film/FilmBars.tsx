import { GROWTH } from '@/landing/data'
import type { Frame } from '@/landing/film/filmScript'
import { cx } from '@/landing/cx'
import { formatCompact } from '@/lib/format'

const MAX = Math.max(...GROWTH.map((g) => g.growth))

/** The answer's chart: growth by region, fastest first; hover a bar for the two years' revenue. */
export function FilmBars({ frame }: { frame: Frame }) {
  return (
    <div className="grid gap-2">
      <p className="font-mono text-[9.5px] tracking-[0.12em] text-ink-faint uppercase">
        Revenue growth, 2022 → 2025
      </p>
      <ul className="grid gap-[7px]">
        {GROWTH.map((g, i) => {
          const p = frame.bars[i] ?? 0
          const lead = i === 0
          return (
            <li
              key={g.region}
              className="group grid grid-cols-[84px_1fr_48px] items-center gap-2 text-[10.5px]"
            >
              <span className={cx('truncate', lead ? 'font-medium text-ink' : 'text-ink-soft')}>
                {g.region}
              </span>
              <div className="relative h-[16px]">
                <div
                  className={cx(
                    'h-full rounded-[3px] transition-[filter] duration-200 group-hover:brightness-110',
                    lead ? 'bg-accent' : 'bg-ink-soft/75',
                  )}
                  style={{ width: `${Math.max(0, (g.growth / MAX) * p * 100)}%` }}
                />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute -top-7 left-0 translate-y-1 rounded-md bg-ink px-2 py-1 font-mono text-[9.5px] whitespace-nowrap text-paper opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
                >
                  {formatCompact(g.revenue2022, 'en-US')} → {formatCompact(g.revenue2025, 'en-US')}
                </span>
              </div>
              <span
                className={cx(
                  'tabular text-right font-mono',
                  lead ? 'text-accent-ink' : 'text-ink-muted',
                )}
              >
                +{(g.growth * 100 * Math.min(1, p)).toFixed(1)}%
              </span>
            </li>
          )
        })}
      </ul>
      <p
        className="mt-1 font-mono text-[9.5px] text-ink-faint transition-opacity duration-500"
        style={{ opacity: (frame.bars.at(-1) ?? 0) >= 0.98 ? 1 : 0 }}
      >
        growth = (revenue 2025 − revenue 2022) ÷ revenue 2022
      </p>
    </div>
  )
}

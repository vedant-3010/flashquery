import type { Histogram } from '@/engine/histogram'
import { formatCompact, formatDate, formatNumber } from '@/lib/format'

function label(value: number, kind: Histogram['kind'], locale: string) {
  if (kind === 'date') return formatDate(new Date(value).toISOString(), locale)
  return Math.abs(value) >= 10_000
    ? formatCompact(value, locale)
    : formatNumber(value, locale, { maxFractionDigits: kind === 'integer' ? 0 : 2 })
}

/** A column's distribution as small bars (F-PROF-06); the label states the range and the peak. */
export function MiniHistogram({
  histogram,
  column,
  locale,
}: {
  histogram: Histogram
  column: string
  locale: string
}) {
  const { bins, kind } = histogram
  const max = Math.max(1, ...bins.map((bin) => bin.count))
  const peak = bins.reduce((best, bin) => (bin.count > best.count ? bin : best), bins[0] ?? null)
  const first = bins[0]
  const last = bins.at(-1)
  if (!first || !last || !peak) return null
  const from = label(first.from, kind, locale)
  const to = label(last.to, kind, locale)
  const summary =
    `Distribution of ${column} from ${from} to ${to}; most values between ` +
    `${label(peak.from, kind, locale)} and ${label(peak.to, kind, locale)}.`

  return (
    <figure className="mt-3">
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${bins.length * 10} 40`}
        preserveAspectRatio="none"
        className="h-10 w-full"
      >
        {bins.map((bin, i) => {
          const height = bin.count === 0 ? 0 : Math.max(1.5, (bin.count / max) * 40)
          return (
            <rect
              key={i}
              x={i * 10 + 1}
              y={40 - height}
              width={8}
              height={height}
              className="fill-primary/60"
            >
              <title>
                {label(bin.from, kind, locale)} – {label(bin.to, kind, locale)}:{' '}
                {formatNumber(bin.count, locale)}
              </title>
            </rect>
          )
        })}
      </svg>
      <figcaption className="mt-0.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{from}</span>
        <span>{to}</span>
      </figcaption>
    </figure>
  )
}

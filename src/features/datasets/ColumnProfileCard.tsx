import { Badge } from '@/components/ui/badge'
import { EXACT_DISTINCT_LIMIT } from '@/engine/profile'
import type { ColumnProfile } from '@/engine/types'
import { ColumnTypeIcon } from '@/features/datasets/ColumnTypeIcon'
import { MiniHistogram } from '@/features/datasets/MiniHistogram'
import { useHistogram } from '@/features/datasets/useHistogram'
import { formatCompact, formatNumber, formatPercent } from '@/lib/format'
import { useDatasetsStore } from '@/stores/datasets'
import { useSettingsStore } from '@/stores/settings'

const ROLE_LABELS: Record<ColumnProfile['role'], string> = {
  id: 'Identifier',
  time: 'Time',
  measure: 'Measure',
  category: 'Category',
  geo: 'Geography',
  boolean: 'Yes/No',
  text: 'Free text',
}

/** A column's profile: role, stats and top values (F-PROF-02, F-PROF-06). */
export function ColumnProfileCard({
  column,
  rowCount,
}: {
  column: ColumnProfile
  rowCount: number
}) {
  const locale = useSettingsStore((state) => state.locale)
  // The profile objects are the dataset's own, so identity finds the table.
  const dataset = useDatasetsStore((state) =>
    state.datasets.find((d) => d.columns.includes(column)),
  )
  const histogram = useHistogram(dataset, column)
  const value = (v: string | number | null) =>
    v === null ? '—' : typeof v === 'number' ? formatNumber(v, locale, { maxFractionDigits: 4 }) : v
  const stats: [string, string][] = [
    ['Nulls', formatPercent(column.nullPct / 100, locale)],
    [
      'Distinct',
      column.approxDistinct <= EXACT_DISTINCT_LIMIT
        ? formatNumber(column.approxDistinct, locale)
        : `≈ ${formatCompact(column.approxDistinct, locale)}`,
    ],
    ['Min', value(column.min)],
    ['Max', value(column.max)],
  ]
  if (column.mean !== null) stats.push(['Mean', value(column.mean)])
  if (column.quartiles) stats.push(['Median', value(column.quartiles[1])])

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2">
        <ColumnTypeIcon duckType={column.type} className="size-4" />
        <span className="min-w-0 flex-1 truncate font-mono font-medium">{column.name}</span>
        <Badge variant="secondary">{ROLE_LABELS[column.role]}</Badge>
      </div>
      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{column.type}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        {stats.map(([label, text]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate text-right tabular-nums" title={text}>
              {text}
            </dd>
          </div>
        ))}
      </dl>
      {histogram === undefined && (
        <div className="mt-3 h-[3.25rem] animate-pulse rounded bg-muted" />
      )}
      {histogram && <MiniHistogram histogram={histogram} column={column.name} locale={locale} />}
      {column.topValues.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Top values</p>
          <ul className="space-y-1">
            {column.topValues.map((top) => {
              const share = rowCount > 0 ? top.count / rowCount : 0
              return (
                <li key={top.value ?? '∅'} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span
                      className={top.value === null ? 'text-muted-foreground italic' : 'truncate'}
                    >
                      {top.value ?? 'null'}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatPercent(share, locale)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 rounded bg-muted">
                    <div
                      className="h-1 rounded bg-primary/60"
                      style={{ width: `${Math.max(2, share * 100)}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

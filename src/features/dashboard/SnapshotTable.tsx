import type { Snapshot } from '@/dashboard/schema'
import { isIdentifierLike } from '@/engine/roles'
import { formatCell, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'

const SHOWN_ROWS = 100

/** A table tile: the snapshot's first rows (the full result is a click away in the workspace). */
export function SnapshotTable({ snapshot }: { snapshot: Snapshot }) {
  const locale = useSettingsStore((state) => state.locale)
  const dates = useSettingsStore((state) => state.dateDisplay)
  const rows = snapshot.rows.slice(0, SHOWN_ROWS)
  const numeric = snapshot.columns.map(
    (c) => c.logicalType === 'integer' || c.logicalType === 'number',
  )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b">
              {snapshot.columns.map((column, i) => (
                <th
                  key={column.name}
                  scope="col"
                  className={cn(
                    'px-2 py-1 font-medium whitespace-nowrap',
                    numeric[i] ? 'text-right' : 'text-left',
                  )}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b last:border-0">
                {snapshot.columns.map((column, i) => {
                  const value = row[i] ?? null
                  return (
                    <td
                      key={column.name}
                      className={cn(
                        'px-2 py-1 whitespace-nowrap',
                        numeric[i] && 'text-right tabular-nums',
                      )}
                    >
                      {value === null ? (
                        <span className="text-muted-foreground">null</span>
                      ) : (
                        formatCell(
                          value,
                          {
                            logicalType: column.logicalType,
                            plainInteger: isIdentifierLike(column.name),
                            dates,
                          },
                          locale,
                        )
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {snapshot.rowCount > rows.length && (
        <p className="shrink-0 pt-1 text-[11px] text-muted-foreground">
          First {formatNumber(rows.length, locale)} of {formatNumber(snapshot.rowCount, locale)}{' '}
          rows.
        </p>
      )}
    </div>
  )
}

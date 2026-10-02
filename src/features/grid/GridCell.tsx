import type { MouseEvent } from 'react'
import type { CellValue } from '@/engine/types'
import { formatCell, type CellFormat } from '@/lib/format'
import { cn } from '@/lib/utils'

interface GridCellProps {
  /** The row, or undefined while its page loads (skeleton). */
  row: CellValue[] | undefined
  value: CellValue | undefined
  format: CellFormat
  locale: string
  selected: boolean
  width: number
  onMouseDown: (event: MouseEvent) => void
}

/** One grid cell: type-aware formatting (F-GRID-03), skeleton while loading, selection (F-GRID-05). */
export function GridCell({
  row,
  value,
  format,
  locale,
  selected,
  width,
  onMouseDown,
}: GridCellProps) {
  const numeric = format.logicalType === 'integer' || format.logicalType === 'number'
  return (
    <div
      role="gridcell"
      aria-selected={selected}
      onMouseDown={onMouseDown}
      className={cn(
        'flex shrink-0 items-center overflow-hidden border-r border-border/40 px-2 whitespace-nowrap',
        numeric && 'justify-end tabular-nums',
        selected && 'bg-primary/10 outline outline-1 -outline-offset-1 outline-primary/40',
      )}
      style={{ width }}
    >
      {row === undefined ? (
        <span className="h-2.5 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      ) : value === null || value === undefined ? (
        <span className="text-muted-foreground/70 italic">null</span>
      ) : (
        <span className="truncate" title={String(value)}>
          {formatCell(value, format, locale)}
        </span>
      )}
    </div>
  )
}

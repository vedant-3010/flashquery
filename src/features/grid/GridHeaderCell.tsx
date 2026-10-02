import { ArrowDown, ArrowUp } from 'lucide-react'
import type { MouseEvent, ReactNode, TouchEvent } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ColumnMeta, ColumnProfile } from '@/engine/types'
import { ColumnProfileCard } from '@/features/datasets/ColumnProfileCard'
import { ColumnTypeIcon } from '@/features/datasets/ColumnTypeIcon'
import { cn } from '@/lib/utils'

interface GridHeaderCellProps {
  meta: ColumnMeta
  width: number
  sorted: false | 'asc' | 'desc'
  /** 1-based position in a multi-column sort, or null. */
  sortPosition: number | null
  onSort: ((event: unknown) => void) | undefined
  onResize: (event: MouseEvent | TouchEvent) => void
  onResetSize: () => void
  resizing: boolean
  profile?: ColumnProfile
  rowCount: number
  /** The column's filter control (F-GRID-04). */
  filter?: ReactNode
}

export function GridHeaderCell({
  meta,
  width,
  sorted,
  sortPosition,
  onSort,
  onResize,
  onResetSize,
  resizing,
  profile,
  rowCount,
  filter,
}: GridHeaderCellProps) {
  const numeric = meta.logicalType === 'integer' || meta.logicalType === 'number'
  const SortIcon = sorted === 'desc' ? ArrowDown : ArrowUp

  return (
    <div
      role="columnheader"
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
      className="group relative flex h-full shrink-0 items-center gap-1 border-r border-border/60 pl-1.5"
      style={{ width }}
    >
      {profile ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Profile of ${meta.name}`}
              className="rounded p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ColumnTypeIcon duckType={meta.duckType} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <ColumnProfileCard column={profile} rowCount={rowCount} />
          </PopoverContent>
        </Popover>
      ) : (
        <span className="p-0.5" title={meta.duckType}>
          <ColumnTypeIcon duckType={meta.duckType} />
        </span>
      )}
      <button
        type="button"
        onClick={onSort}
        title={`${meta.name} · ${meta.duckType}. Click to sort, Shift-click to add to the sort.`}
        className={cn(
          'flex h-full min-w-0 flex-1 items-center gap-1 pr-2 text-left font-mono text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset',
          numeric && 'flex-row-reverse text-right',
        )}
      >
        <span className="truncate">{meta.name}</span>
        {sorted && (
          <span className="flex shrink-0 items-center text-primary">
            <SortIcon className="size-3" aria-hidden />
            {sortPosition !== null && <span className="text-[10px]">{sortPosition}</span>}
          </span>
        )}
      </button>
      {filter}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${meta.name}`}
        onMouseDown={onResize}
        onTouchStart={onResize}
        onDoubleClick={onResetSize}
        className={cn(
          'absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40',
          resizing && 'bg-primary/60',
        )}
      />
    </div>
  )
}

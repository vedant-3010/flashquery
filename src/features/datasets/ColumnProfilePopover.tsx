import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ColumnProfile } from '@/engine/types'
import { ColumnProfileCard } from '@/features/datasets/ColumnProfileCard'
import { ColumnTypeIcon } from '@/features/datasets/ColumnTypeIcon'

interface ColumnProfilePopoverProps {
  column: ColumnProfile
  rowCount: number
}

/** Column in the sidebar catalog; opens its profile (F-PROF-01). */
export function ColumnProfilePopover({ column, rowCount }: ColumnProfilePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded px-2 py-0.5 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ColumnTypeIcon duckType={column.type} />
          <span className="truncate font-mono">{column.name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72">
        <ColumnProfileCard column={column} rowCount={rowCount} />
      </PopoverContent>
    </Popover>
  )
}

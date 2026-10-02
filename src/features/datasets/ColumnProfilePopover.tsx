import { Shapes } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ColumnProfile, DatasetProfile } from '@/engine/types'
import { ColumnProfileCard } from '@/features/datasets/ColumnProfileCard'
import { ColumnTypeDialog } from '@/features/datasets/ColumnTypeDialog'
import { ColumnTypeIcon } from '@/features/datasets/ColumnTypeIcon'

interface ColumnProfilePopoverProps {
  dataset: DatasetProfile
  column: ColumnProfile
}

/** Column in the sidebar catalog; opens its profile (F-PROF-01) and type change (F-DATA-09). */
export function ColumnProfilePopover({ dataset, column }: ColumnProfilePopoverProps) {
  const [open, setOpen] = useState(false)
  const [retyping, setRetyping] = useState(false)
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
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
          <ColumnProfileCard column={column} rowCount={dataset.rowCount} />
          <Button
            size="xs"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setOpen(false)
              setRetyping(true)
            }}
          >
            <Shapes aria-hidden />
            Change type…
          </Button>
        </PopoverContent>
      </Popover>
      <ColumnTypeDialog
        dataset={dataset}
        column={column}
        open={retyping}
        onOpenChange={setRetyping}
      />
    </>
  )
}

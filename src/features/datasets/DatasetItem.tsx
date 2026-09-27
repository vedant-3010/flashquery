import { ChevronRight, Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/IconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DatasetProfile } from '@/engine/types'
import { ColumnProfilePopover } from '@/features/datasets/ColumnProfilePopover'
import { RemoveDatasetDialog } from '@/features/datasets/RemoveDatasetDialog'
import { RenameDatasetDialog } from '@/features/datasets/RenameDatasetDialog'
import { sourceSummary } from '@/features/datasets/sourceSummary'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

export function DatasetItem({ dataset }: { dataset: DatasetProfile }) {
  const locale = useSettingsStore((state) => state.locale)
  const previewTable = useUiStore((state) => state.previewTable)
  const showPreview = useUiStore((state) => state.showPreview)
  const [expanded, setExpanded] = useState(true)
  const [dialog, setDialog] = useState<'rename' | 'remove' | null>(null)
  const selected = previewTable === dataset.table

  return (
    <section aria-label={dataset.label} className="px-2 py-1">
      <div
        className={cn(
          'flex items-center gap-0.5 rounded-md pr-1 hover:bg-muted/70',
          selected && 'bg-muted',
        )}
      >
        <IconButton
          label={expanded ? `Hide columns of ${dataset.label}` : `Show columns of ${dataset.label}`}
          size="icon-xs"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight className={cn('transition-transform', expanded && 'rotate-90')} />
        </IconButton>
        <button
          type="button"
          className="min-w-0 flex-1 rounded py-1 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Preview ${dataset.label}`}
          aria-current={selected || undefined}
          onClick={() => showPreview(dataset.table)}
        >
          <span className="block truncate text-sm font-medium">{dataset.label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            <span className="font-mono">{dataset.table}</span> ·{' '}
            {formatCompact(dataset.rowCount, locale)} rows · {dataset.columns.length} columns
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={`Actions for ${dataset.label}`} size="icon-xs">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => showPreview(dataset.table)}>
              <Eye aria-hidden />
              Preview rows
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog('rename')}>
              <Pencil aria-hidden />
              Rename…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog('remove')}>
              <Trash2 aria-hidden />
              Remove…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && (
        <div className="pl-6">
          <p className="px-2 pb-1 text-[11px] leading-snug text-muted-foreground">
            {sourceSummary(dataset, locale)}
          </p>
          <ul aria-label={`Columns of ${dataset.label}`}>
            {dataset.columns.map((column) => (
              <li key={column.name}>
                <ColumnProfilePopover column={column} rowCount={dataset.rowCount} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <RenameDatasetDialog
        dataset={dataset}
        open={dialog === 'rename'}
        onOpenChange={(open) => setDialog(open ? 'rename' : null)}
      />
      <RemoveDatasetDialog
        dataset={dataset}
        open={dialog === 'remove'}
        onOpenChange={(open) => setDialog(open ? 'remove' : null)}
      />
    </section>
  )
}

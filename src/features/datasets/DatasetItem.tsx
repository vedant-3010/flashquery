import {
  ChevronRight,
  Eye,
  FileCog,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  SquareTerminal,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/IconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DatasetProfile } from '@/engine/types'
import { ColumnProfilePopover } from '@/features/datasets/ColumnProfilePopover'
import { ImportOptionsDialog } from '@/features/datasets/ImportOptionsDialog'
import { NotesDialog } from '@/features/datasets/NotesDialog'
import { RemoveDatasetDialog } from '@/features/datasets/RemoveDatasetDialog'
import { RenameDatasetDialog } from '@/features/datasets/RenameDatasetDialog'
import { sourceSummary } from '@/features/datasets/sourceSummary'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import { importOptionsOf } from '@/stores/datasetEdits'
import { useSettingsStore } from '@/stores/settings'
import { useSqlStore } from '@/stores/sql'
import { useUiStore } from '@/stores/ui'

export function DatasetItem({ dataset }: { dataset: DatasetProfile }) {
  const locale = useSettingsStore((state) => state.locale)
  const previewTable = useUiStore((state) => state.previewTable)
  const showPreview = useUiStore((state) => state.showPreview)
  const openInSql = useSqlStore((state) => state.openTable)
  // When the user last collapsed the column list (null = expanded).
  const [collapsedAt, setCollapsedAt] = useState<number | null>(null)
  const [dialog, setDialog] = useState<'rename' | 'remove' | 'notes' | 'import' | null>(null)
  const selected = previewTable === dataset.table
  const highlight = useUiStore((state) =>
    state.highlight?.table === dataset.table ? state.highlight : null,
  )
  const [flashedAt, setFlashedAt] = useState<number | null>(null)
  const section = useRef<HTMLElement>(null)
  // A newer highlight re-expands the list; it flashes until its timer ends.
  const expanded = collapsedAt === null || (highlight !== null && highlight.at > collapsedAt)
  const flash = highlight !== null && highlight.at !== flashedAt ? (highlight.column ?? '') : null

  // "Columns used" chips in an answer point here (F-EXPL-02): scroll to and flash the column.
  useEffect(() => {
    if (!highlight) return
    const frame = requestAnimationFrame(() => {
      const target =
        highlight.column === null
          ? section.current
          : section.current?.querySelector(`[data-column="${CSS.escape(highlight.column)}"]`)
      target?.scrollIntoView({ block: 'nearest' })
    })
    const timer = window.setTimeout(() => setFlashedAt(highlight.at), 1600)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [highlight])

  return (
    <section ref={section} aria-label={dataset.label} className="px-2 py-1">
      <div
        className={cn(
          'flex items-center gap-0.5 rounded-md pr-1 transition-colors duration-500 hover:bg-muted/70',
          selected && 'bg-muted',
          flash === '' && 'bg-primary/15',
        )}
      >
        <IconButton
          label={expanded ? `Hide columns of ${dataset.label}` : `Show columns of ${dataset.label}`}
          size="icon-xs"
          aria-expanded={expanded}
          onClick={() => setCollapsedAt(expanded ? Date.now() : null)}
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
            <DropdownMenuItem onSelect={() => openInSql(dataset.table)}>
              <SquareTerminal aria-hidden />
              Open in SQL
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog('rename')}>
              <Pencil aria-hidden />
              Rename…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog('notes')}>
              <NotebookPen aria-hidden />
              Notes…
            </DropdownMenuItem>
            {importOptionsOf(dataset.id) && (
              <DropdownMenuItem onSelect={() => setDialog('import')}>
                <FileCog aria-hidden />
                Import options…
              </DropdownMenuItem>
            )}
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
          {dataset.notes && (
            <p className="line-clamp-2 px-2 pb-1 text-[11px] leading-snug" title={dataset.notes}>
              <span className="font-medium">Notes: </span>
              {dataset.notes}
            </p>
          )}
          <ul aria-label={`Columns of ${dataset.label}`}>
            {dataset.columns.map((column) => (
              <li
                key={column.name}
                data-column={column.name}
                className={cn(
                  'rounded-md transition-colors duration-500',
                  flash === column.name && 'bg-primary/15',
                )}
              >
                <ColumnProfilePopover dataset={dataset} column={column} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <ImportOptionsDialog
        dataset={dataset}
        open={dialog === 'import'}
        onOpenChange={(open) => setDialog(open ? 'import' : null)}
      />
      <NotesDialog
        dataset={dataset}
        open={dialog === 'notes'}
        onOpenChange={(open) => setDialog(open ? 'notes' : null)}
      />
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

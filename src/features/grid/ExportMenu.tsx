import { ClipboardCopy, Download, FileDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getDb } from '@/engine/duckdb'
import { EXPORT_MIME, exportQuery, type ExportFormat } from '@/engine/export'
import type { ColumnFilter } from '@/engine/gridFilters'
import { exportSql, type PagedResult, type SortSpec } from '@/engine/paging'
import { runQuery } from '@/engine/query'
import { downloadBytes } from '@/lib/download'
import { toAppError } from '@/lib/errors'
import { formatBytes, formatNumber } from '@/lib/format'
import { toTsv, TSV_MAX_ROWS } from '@/lib/tsv'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'

interface ExportMenuProps {
  result: PagedResult
  sorting: SortSpec[]
  /** Column filters: exports hold the rows the grid shows (F-GRID-04). */
  filters: readonly ColumnFilter[]
  /** Rows after filtering. */
  rowCount: number
  /** File name without extension. */
  fileStem: string
  onStatus: (message: string) => void
}

/** Download as CSV/Parquet or copy as TSV: the grid's rows, filtered and in its order (F-EXP-01). */
export function ExportMenu({
  result,
  sorting,
  filters,
  rowCount,
  fileStem,
  onStatus,
}: ExportMenuProps) {
  const locale = useSettingsStore((state) => state.locale)
  const [busy, setBusy] = useState(false)
  const canCopy = rowCount <= TSV_MAX_ROWS

  const run = async (task: () => Promise<string>) => {
    setBusy(true)
    try {
      onStatus(await task())
    } catch (error) {
      onStatus(toAppError(error, 'export_failed', "Couldn't export these rows.").message)
    } finally {
      setBusy(false)
    }
  }

  const download = (format: ExportFormat) =>
    run(async () => {
      const bytes = await exportQuery(await getDb(), exportSql(result, sorting, filters), format)
      const fileName = `${fileStem}.${format}`
      downloadBytes(bytes, fileName, EXPORT_MIME[format])
      const message = `Downloaded ${fileName} (${formatBytes(bytes.length, locale)})`
      useToastStore.getState().show(`${message}.`)
      return message
    })

  const copy = () =>
    run(async () => {
      const { columns, rows } = await runQuery(await getDb(), exportSql(result, sorting, filters), {
        maxRows: TSV_MAX_ROWS,
      })
      await navigator.clipboard.writeText(
        toTsv(
          columns.map((column) => column.name),
          rows,
        ),
      )
      return `Copied ${formatNumber(rows.length, locale)} rows`
    })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" disabled={busy}>
          <Download aria-hidden />
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void download('csv')}>
          <FileDown aria-hidden />
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void download('parquet')}>
          <FileDown aria-hidden />
          Download Parquet
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canCopy} onSelect={() => void copy()}>
          <ClipboardCopy aria-hidden />
          {canCopy
            ? 'Copy as TSV'
            : `Copy as TSV (up to ${formatNumber(TSV_MAX_ROWS, locale)} rows)`}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

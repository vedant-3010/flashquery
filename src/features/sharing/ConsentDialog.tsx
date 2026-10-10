import { CircleCheck, CircleX, CloudUpload, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { describeUpload, largestTiles, MAX_SHARED_BYTES } from '@/dashboard/cloud'
import type { Dashboard, TileType } from '@/dashboard/schema'
import { FormError } from '@/features/account/FormError'
import type { AppErrorData } from '@/lib/errors'
import { formatBytes, formatNumber } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

const KIND: Record<TileType, string> = { chart: 'Chart', kpi: 'KPI', table: 'Table', text: 'Text' }

/**
 * Before anything uploads (F-SHARE-02, D103): exactly what goes to the account (each tile, its
 * rows and columns, the size) and what never does. Nothing is sent until "Upload".
 */
export function ConsentDialog({
  dashboard,
  mode,
  open,
  onOpenChange,
  onConfirm,
  pending,
  error,
}: {
  dashboard: Dashboard
  /** A first share, or replacing the shared copy (F-SHARE-07). */
  mode: 'share' | 'update'
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  pending: boolean
  error: AppErrorData | null
}) {
  const locale = useSettingsStore((state) => state.locale)
  const summary = useMemo(() => (open ? describeUpload(dashboard) : null), [open, dashboard])
  const largest = useMemo(
    () => (summary?.tooBig ? largestTiles(dashboard) : []),
    [summary, dashboard],
  )
  const n = (value: number) => formatNumber(value, locale, { maxFractionDigits: 0 })

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'share' ? `Share “${dashboard.name}”?` : 'Update the shared copy?'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'share'
              ? 'These results go to your flashQuery account, so the people you choose can see them.'
              : 'People with access will see these results in place of the ones shared before.'}
          </DialogDescription>
        </DialogHeader>

        {summary && (
          <div className="grid min-w-0 gap-3 text-sm">
            <div className="max-h-64 overflow-auto rounded-lg border">
              <table className="w-full text-left text-[13px]">
                <caption className="sr-only">What will upload, tile by tile</caption>
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      Tile
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      Kind
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">
                      Rows
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-medium">
                      Columns
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.tiles.map((tile) => (
                    <tr key={tile.id} className="border-t">
                      <td className="max-w-48 truncate px-3 py-1.5" title={tile.title}>
                        {tile.title}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{KIND[tile.type]}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {tile.type === 'text' ? '—' : n(tile.rows)}
                      </td>
                      <td
                        className="max-w-64 truncate px-3 py-1.5 text-muted-foreground"
                        title={tile.columns.join(', ')}
                      >
                        {tile.columns.length > 0 ? tile.columns.join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground" data-testid="upload-total">
              {summary.tiles.length} {summary.tiles.length === 1 ? 'tile' : 'tiles'} ·{' '}
              {n(summary.rows)} {summary.rows === 1 ? 'row' : 'rows'} ·{' '}
              {formatBytes(summary.bytes, locale)}
            </p>
            <ul className="grid gap-1.5 text-[13px]">
              <li className="flex items-start gap-2">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="font-medium">Also uploaded:</span> the dashboard and tile names,
                  layout, each tile’s SQL and chart settings, the question it answered, and text
                  tiles.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CircleX className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>
                  <span className="font-medium">Never uploaded:</span> your files, any other rows,
                  which files the results came from, the dashboard’s filters, your API keys.
                </span>
              </li>
            </ul>
            {summary.tooBig && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  This is {formatBytes(summary.bytes, locale)}; a shared dashboard can be up to{' '}
                  {formatBytes(MAX_SHARED_BYTES, locale)}. The largest tiles are{' '}
                  {largest
                    .map((tile) => `“${tile.title}” (${formatBytes(tile.bytes, locale)})`)
                    .join(', ')}
                  . Remove some, or make them smaller (a table of fewer rows), and try again.
                </span>
              </p>
            )}
            <FormError error={error} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !summary || summary.tooBig} onClick={onConfirm}>
            {pending ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <CloudUpload aria-hidden />
            )}
            {pending ? 'Uploading…' : mode === 'share' ? 'Upload and share' : 'Upload update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

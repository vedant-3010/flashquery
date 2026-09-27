import { FileSpreadsheet, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { useElapsed } from '@/hooks/useElapsed'
import { formatDuration, formatNumber } from '@/lib/format'
import { useDatasetsStore, type IngestJob } from '@/stores/datasets'
import { useSettingsStore } from '@/stores/settings'

export function IngestJobRow({ job }: { job: IngestJob }) {
  const locale = useSettingsStore((state) => state.locale)
  const { cancelJob, retryJob, chooseSheet } = useDatasetsStore()
  const running = job.status === 'loading' || job.status === 'profiling'
  const elapsed = useElapsed(job.startedAt, running)
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div
      role={job.status === 'error' ? 'alert' : 'status'}
      aria-label={job.label}
      className="mx-2 my-1 rounded-lg border bg-background p-2 text-sm"
    >
      <div className="flex items-start gap-2">
        {job.status === 'error' ? (
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        ) : job.status === 'choose-sheet' ? (
          <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <LoaderCircle
            className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={job.label}>
            {job.label}
          </p>
          {running && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {job.status === 'profiling' ? 'Profiling columns' : 'Loading'} ·{' '}
              {formatDuration(elapsed, locale)}
            </p>
          )}
          {running && job.warning && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{job.warning}</p>
          )}
          {job.status === 'choose-sheet' && (
            <p className="text-xs text-muted-foreground">Choose a sheet to load</p>
          )}
          {job.status === 'error' && job.error && (
            <p className="mt-0.5 text-xs text-muted-foreground">{job.error.message}</p>
          )}
        </div>
        <IconButton
          label={job.status === 'error' ? `Dismiss ${job.label}` : `Cancel loading ${job.label}`}
          className="-mt-1 -mr-1"
          onClick={() => cancelJob(job.id)}
        >
          <X />
        </IconButton>
      </div>

      {job.status === 'choose-sheet' && job.sheets && (
        <ul className="mt-2 space-y-1" aria-label="Sheets">
          {job.sheets.map((sheet) => (
            <li key={sheet.name}>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between"
                onClick={() => chooseSheet(job.id, sheet.name)}
              >
                <span className="truncate">{sheet.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(sheet.rows, locale)} rows
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {job.status === 'error' && job.error && (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.error.code === 'csv_parse' && (
              <Button size="xs" onClick={() => retryJob(job.id, { skipBadRows: true })}>
                Skip bad rows
              </Button>
            )}
            {job.canRetry && job.error.code !== 'csv_parse' && (
              <Button size="xs" variant="outline" onClick={() => retryJob(job.id)}>
                Retry
              </Button>
            )}
            {job.error.detail && (
              <Button
                size="xs"
                variant="ghost"
                aria-expanded={showDetails}
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? 'Hide details' : 'Show details'}
              </Button>
            )}
          </div>
          {showDetails && job.error.detail && (
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">
              {job.error.detail}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

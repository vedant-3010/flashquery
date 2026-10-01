import { Play } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChartSpec } from '@/charts/spec'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { checkRefs, runTile, type TileRunResult } from '@/dashboard/run'
import type { Dashboard, DashboardTile } from '@/dashboard/schema'
import { getDb } from '@/engine/duckdb'
import { Markdown } from '@/features/dashboard/Markdown'
import { SnapshotTable } from '@/features/dashboard/SnapshotTable'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { toAppError } from '@/lib/errors'
import { findTile, useDashboardStore } from '@/stores/dashboard'
import { useDatasetsStore } from '@/stores/datasets'
import { useSettingsStore } from '@/stores/settings'

const SqlEditor = lazy(() =>
  import('@/features/sql/SqlEditor').then((module) => ({ default: module.SqlEditor })),
)
const ChartPanel = lazy(() =>
  import('@/features/charts/ChartPanel').then((module) => ({ default: module.ChartPanel })),
)

function TextEditor({ tile, onDone }: { tile: DashboardTile; onDone: () => void }) {
  const updateTile = useDashboardStore((state) => state.updateTile)
  const [title, setTitle] = useState(tile.title)
  const [text, setText] = useState(tile.text ?? '')
  const titleId = useId()
  const textId = useId()
  return (
    <>
      <div className="grid gap-4 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor={titleId}>Title</Label>
          <Input
            id={titleId}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={textId}>Text (markdown)</Label>
          <Textarea
            id={textId}
            rows={8}
            value={text}
            className="font-mono text-xs"
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            # headings, - lists, **bold**, *italic*, `code` and [links](https://…).
          </p>
        </div>
        <section aria-label="Preview" className="rounded-md border p-3">
          <Markdown text={text} />
        </section>
      </div>
      <SheetFooter>
        <Button
          onClick={() => {
            updateTile(tile.id, { title: title.trim() || tile.title, text })
            onDone()
          }}
        >
          Save
        </Button>
      </SheetFooter>
    </>
  )
}

function QueryEditor({
  tile,
  dashboard,
  onDone,
}: {
  tile: DashboardTile
  dashboard: Dashboard
  onDone: () => void
}) {
  const { updateTile, setStatus } = useDashboardStore()
  const datasets = useDatasetsStore((state) => state.datasets)
  const currency = useSettingsStore((state) => state.currency)
  const dark = useResolvedTheme() === 'dark'
  const [title, setTitle] = useState(tile.title)
  const [sql, setSql] = useState(tile.sql ?? '')
  const sqlRef = useRef(tile.sql ?? '')
  const [asTable, setAsTable] = useState(tile.type === 'table')
  const [run, setRun] = useState<TileRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const titleId = useId()
  const refs = checkRefs(tile.datasetRefs, datasets)

  const execute = useCallback(
    async (spec: ChartSpec | null, table: boolean) => {
      setBusy(true)
      setError(null)
      try {
        setRun(
          await runTile(await getDb(), {
            sql: sqlRef.current,
            spec,
            asTable: table,
            title,
            question: tile.question,
            currency,
            datasets: useDatasetsStore.getState().datasets,
            filters: dashboard.filters,
          }),
        )
      } catch (caught) {
        setError(toAppError(caught).message)
      } finally {
        setBusy(false)
      }
    },
    [title, tile.question, currency, dashboard.filters],
  )

  // A first run, so the chart can be switched and adjusted right away.
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !refs.ok) return
    started.current = true
    void execute(tile.chartSpec, tile.type === 'table')
  }, [execute, refs.ok, tile.chartSpec, tile.type])

  const schema = useMemo(
    () => Object.fromEntries(datasets.map((d) => [d.table, d.columns.map((c) => c.name)])),
    [datasets],
  )
  const onRun = useCallback(
    () => execute(run?.spec ?? tile.chartSpec, asTable),
    [execute, run, tile.chartSpec, asTable],
  )
  const changed = sql.trim() !== (tile.sql ?? '').trim()

  const save = () => {
    if (!run) {
      updateTile(tile.id, { title: title.trim() || tile.title })
      onDone()
      return
    }
    updateTile(tile.id, {
      title: title.trim() || tile.title,
      sql: run.sql,
      chartSpec: run.spec,
      type: asTable ? 'table' : run.type,
      snapshot: run.snapshot,
      datasetRefs: run.datasetRefs,
      edited: tile.edited || changed,
    })
    setStatus(tile.id, { state: 'live', message: null })
    onDone()
  }

  return (
    <>
      <div className="grid gap-4 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor={titleId}>Title</Label>
          <Input
            id={titleId}
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">SQL</span>
            <Button
              size="xs"
              className="ml-auto"
              disabled={busy || !sql.trim()}
              onClick={() => void onRun()}
            >
              <Play aria-hidden />
              {busy ? 'Running…' : 'Run'}
            </Button>
          </div>
          <div className="h-40 overflow-hidden rounded-md border">
            <Suspense fallback={<Skeleton className="m-2 h-24" />}>
              <SqlEditor
                value={sql}
                onChange={(value) => {
                  sqlRef.current = value
                  setSql(value)
                }}
                onRun={onRun}
                schema={schema}
                defaultTable={tile.datasetRefs[0]?.table}
                dark={dark}
                placeholder="SELECT …"
              />
            </Suspense>
          </div>
          <p className="text-xs text-muted-foreground">
            Checked like generated SQL; the dashboard&apos;s filters apply when it runs.
          </p>
        </div>
        <RadioGroup
          value={asTable ? 'table' : 'chart'}
          onValueChange={(value) => {
            const table = value === 'table'
            setAsTable(table)
            void execute(run?.spec ?? tile.chartSpec, table)
          }}
          className="flex gap-4"
          aria-label="Show as"
        >
          <Label className="flex items-center gap-2 font-normal">
            <RadioGroupItem value="chart" /> Chart
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <RadioGroupItem value="table" /> Table
          </Label>
        </RadioGroup>

        {!refs.ok && <p className="text-sm text-muted-foreground">{refs.message}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {run && !asTable && run.spec && (
          <Suspense fallback={<Skeleton className="h-72 w-full" />}>
            <ChartPanel
              spec={run.spec}
              data={run.snapshot}
              columns={run.columns}
              rows={run.rows}
              rowCount={run.snapshot.rowCount}
              question={tile.question ?? undefined}
              auto={run.spec}
              picked={false}
              loading={busy}
              onChange={(spec) => void execute(spec, false)}
            />
          </Suspense>
        )}
        {run && asTable && (
          <div className="h-64">
            <SnapshotTable snapshot={run.snapshot} />
          </div>
        )}
      </div>
      <SheetFooter>
        <Button onClick={save} disabled={busy || (changed && !run)}>
          Save
        </Button>
      </SheetFooter>
    </>
  )
}

/** Edit a tile in a side sheet (F-DASH-07): title, SQL and chart, or the text of a text tile. */
export function EditTileSheet({ tileId, onClose }: { tileId: string | null; onClose: () => void }) {
  const dashboards = useDashboardStore((state) => state.dashboards)
  const found = useMemo(() => (tileId ? findTile(dashboards, tileId) : null), [dashboards, tileId])
  return (
    <Sheet open={found !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit tile</SheetTitle>
          <SheetDescription>
            {found?.tile.type === 'text'
              ? 'Headings and notes for the dashboard.'
              : 'Change the query or the chart; Run previews it before you save.'}
          </SheetDescription>
        </SheetHeader>
        {found &&
          (found.tile.type === 'text' ? (
            <TextEditor key={found.tile.id} tile={found.tile} onDone={onClose} />
          ) : (
            <QueryEditor
              key={found.tile.id}
              tile={found.tile}
              dashboard={found.dashboard}
              onDone={onClose}
            />
          ))}
      </SheetContent>
    </Sheet>
  )
}

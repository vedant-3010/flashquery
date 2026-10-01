import { Filter, X } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Dashboard } from '@/dashboard/schema'
import { getDb } from '@/engine/duckdb'
import { MAX_VALUE_FILTERS, type DashboardFilter } from '@/engine/filters'
import { quoteIdent } from '@/engine/naming'
import { toLogicalType } from '@/engine/normalize'
import { runQuery } from '@/engine/query'
import type { CellValue, ColumnProfile, DatasetProfile } from '@/engine/types'
import { humanizeName } from '@/lib/format'
import { toAppError } from '@/lib/errors'
import { applyFilters } from '@/stores/dashboardJobs'
import { useDatasetsStore } from '@/stores/datasets'

interface Candidate {
  key: string
  table: string
  column: ColumnProfile
  kind: 'date' | 'values'
}

const isDate = (column: ColumnProfile) => ['date', 'timestamp'].includes(toLogicalType(column.type))
const isCategory = (column: ColumnProfile) =>
  ['category', 'geo', 'boolean'].includes(column.role) && column.approxDistinct <= 50

function candidatesFor(dashboard: Dashboard, datasets: DatasetProfile[]): Candidate[] {
  const tables = new Set(dashboard.tiles.flatMap((t) => t.datasetRefs.map((r) => r.table)))
  return datasets
    .filter((d) => tables.has(d.table))
    .flatMap((d) =>
      d.columns.flatMap((column): Candidate[] =>
        isDate(column)
          ? [{ key: `${d.table}.${column.name}`, table: d.table, column, kind: 'date' }]
          : isCategory(column)
            ? [{ key: `${d.table}.${column.name}`, table: d.table, column, kind: 'values' }]
            : [],
      ),
    )
}

function describeFilter(filter: DashboardFilter): string {
  const name = humanizeName(filter.column)
  if (filter.kind === 'date') {
    if (filter.from && filter.to) return `${name}: ${filter.from} – ${filter.to}`
    return filter.from ? `${name}: from ${filter.from}` : `${name}: until ${filter.to ?? ''}`
  }
  const shown = filter.values.slice(0, 3).map((v) => (v === null ? '(blank)' : String(v)))
  const more = filter.values.length > 3 ? ` +${filter.values.length - 3}` : ''
  return `${name}: ${shown.join(', ')}${more}`
}

function years(column: ColumnProfile): number[] {
  const first = Number(String(column.min ?? '').slice(0, 4))
  const last = Number(String(column.max ?? '').slice(0, 4))
  if (!first || !last || last < first) return []
  return Array.from({ length: Math.min(6, last - first + 1) }, (_, i) => last - i).reverse()
}

function AddFilter({ dashboard, candidates }: { dashboard: Dashboard; candidates: Candidate[] }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState<string>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [values, setValues] = useState<CellValue[] | null>(null)
  const [chosen, setChosen] = useState<CellValue[]>([])
  const [error, setError] = useState<string | null>(null)
  const columnId = useId()
  const candidate = candidates.find((c) => c.key === key)
  const valueFilters = dashboard.filters.filter((f) => f.kind === 'values').length

  // Distinct values of the chosen category column, from DuckDB.
  useEffect(() => {
    if (candidate?.kind !== 'values') return
    let active = true
    const sql = `SELECT DISTINCT ${quoteIdent(candidate.column.name)} AS v FROM ${quoteIdent(candidate.table)} ORDER BY 1 NULLS LAST`
    getDb()
      .then((engine) => runQuery(engine, sql, { maxRows: 100 }))
      .then((result) => active && setValues(result.rows.map((row) => row[0] ?? null)))
      .catch((caught: unknown) => active && setError(toAppError(caught).message))
    return () => {
      active = false
    }
  }, [candidate])

  const reset = () => {
    setKey('')
    setFrom('')
    setTo('')
    setValues(null)
    setChosen([])
    setError(null)
  }

  const apply = () => {
    if (!candidate) return
    const filter: DashboardFilter =
      candidate.kind === 'date'
        ? {
            kind: 'date',
            table: candidate.table,
            column: candidate.column.name,
            from: from || null,
            to: to || null,
          }
        : {
            kind: 'values',
            table: candidate.table,
            column: candidate.column.name,
            values: chosen,
          }
    // One date range per dashboard; a new one replaces the old.
    const rest = dashboard.filters.filter(
      (f) =>
        !(filter.kind === 'date' && f.kind === 'date') &&
        !(f.table === filter.table && f.column === filter.column),
    )
    void applyFilters(dashboard.id, [...rest, filter])
    setOpen(false)
    reset()
  }

  const valid =
    candidate?.kind === 'date'
      ? Boolean(from || to) && (!from || !to || from <= to)
      : chosen.length > 0
  const dates = candidates.filter((c) => c.kind === 'date')
  const categories = candidates.filter((c) => c.kind === 'values')

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <PopoverTrigger asChild>
        <Button size="xs" variant="outline" disabled={candidates.length === 0}>
          <Filter aria-hidden />
          Add filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={columnId} className="text-xs">
            Filter by
          </Label>
          <Select
            value={key}
            onValueChange={(next) => {
              reset()
              setKey(next)
            }}
          >
            <SelectTrigger id={columnId} size="sm" className="w-full">
              <SelectValue placeholder="Choose a column" />
            </SelectTrigger>
            <SelectContent>
              {dates.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Date range</SelectLabel>
                  {dates.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {humanizeName(c.column.name)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {categories.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Values</SelectLabel>
                  {categories.map((c) => (
                    <SelectItem
                      key={c.key}
                      value={c.key}
                      disabled={
                        valueFilters >= MAX_VALUE_FILTERS &&
                        !dashboard.filters.some((f) => f.column === c.column.name)
                      }
                    >
                      {humanizeName(c.column.name)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>

        {candidate?.kind === 'date' && (
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-1">
              {years(candidate.column).map((year) => (
                <Button
                  key={year}
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setFrom(`${year}-01-01`)
                    setTo(`${year}-12-31`)
                  }}
                >
                  {year}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Label className="grid gap-1 text-xs">
                From
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Label>
              <Label className="grid gap-1 text-xs">
                To
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Label>
            </div>
          </div>
        )}

        {candidate?.kind === 'values' && (
          <fieldset className="grid max-h-56 gap-1.5 overflow-y-auto">
            <legend className="sr-only">Values of {humanizeName(candidate.column.name)}</legend>
            {values === null && !error && <p className="text-xs text-muted-foreground">Loading…</p>}
            {values?.map((value) => {
              const label = value === null ? '(blank)' : String(value)
              const checked = chosen.includes(value)
              return (
                <Label key={label} className="flex items-center gap-2 text-xs font-normal">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(on) =>
                      setChosen(
                        on === true ? [...chosen, value] : chosen.filter((v) => v !== value),
                      )
                    }
                  />
                  {label}
                </Label>
              )
            })}
          </fieldset>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button size="sm" disabled={!valid} onClick={apply}>
          Apply to every tile
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** The dashboard's filters (F-DASH-10): a date range and up to 3 value filters. */
export function FilterBar({ dashboard }: { dashboard: Dashboard }) {
  const datasets = useDatasetsStore((state) => state.datasets)
  const candidates = useMemo(() => candidatesFor(dashboard, datasets), [dashboard, datasets])
  const remove = (index: number) =>
    void applyFilters(
      dashboard.id,
      dashboard.filters.filter((_, i) => i !== index),
    )

  if (dashboard.tiles.every((t) => t.type === 'text')) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filters" role="group">
      {dashboard.filters.map((filter, index) => {
        const label = describeFilter(filter)
        return (
          <span
            key={`${filter.table}.${filter.column}`}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5 text-xs"
          >
            {label}
            <button
              type="button"
              aria-label={`Remove filter ${label}`}
              className="rounded-full p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => remove(index)}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        )
      })}
      <AddFilter dashboard={dashboard} candidates={candidates} />
      {candidates.length === 0 && (
        <span className="text-xs text-muted-foreground">Load the data to add filters.</span>
      )}
    </div>
  )
}

// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Engine } from '@/engine/connection'
import { profileTable } from '@/engine/profile'
import { runQuery } from '@/engine/query'
import { createGlobalSalesSql } from '@/engine/samples'
import type { DatasetProfile } from '@/engine/types'
import { createTestEngine } from '@/test/duckdb'
import { checkRefs, runTile } from './run'

// Tiles: guarded, filtered, snapshotted (F-DASH-01/04/10).

let engine: Engine
let sales: DatasetProfile

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(createGlobalSalesSql(20_000))
  const profile = await profileTable(engine, 'global_sales')
  sales = {
    id: 'ds_1',
    table: 'global_sales',
    label: 'Global Sales · 10k rows',
    source: {
      kind: 'sample',
      format: 'generated',
      fileName: null,
      sizeBytes: null,
      sheet: null,
      csv: null,
      skippedRows: 0,
    },
    rowCount: profile.rowCount,
    schemaHash: profile.schemaHash,
    columns: profile.columns,
    notes: null,
    timings: { loadMs: 0, profileMs: 0 },
    createdAt: 0,
  }
})

afterAll(() => engine.terminate())

const BY_REGION =
  'SELECT region, round(sum(revenue), 2) AS total_revenue FROM global_sales GROUP BY ALL ORDER BY total_revenue DESC'

const base = { asTable: false, spec: null, filters: [] }

describe('runTile', () => {
  it('runs a chart tile and records what it read', async () => {
    const tile = await runTile(engine, { ...base, sql: BY_REGION, datasets: [sales] })
    expect(tile.type).toBe('chart')
    expect(tile.spec).toMatchObject({ type: 'bar', x: 'region' })
    expect(tile.snapshot).toMatchObject({ rowCount: 5, sampling: 'none', filtered: false })
    expect(tile.datasetRefs).toEqual([
      {
        table: 'global_sales',
        schemaHash: sales.schemaHash,
        label: sales.label,
        fileName: null,
        sample: true,
      },
    ])
  })

  it('applies the dashboard filters to the tables the tile reads', async () => {
    const tile = await runTile(engine, {
      ...base,
      sql: 'SELECT round(sum(revenue), 2) AS total_revenue FROM global_sales',
      datasets: [sales],
      filters: [
        {
          kind: 'date',
          table: 'global_sales',
          column: 'order_date',
          from: '2025-01-01',
          to: '2025-12-31',
        },
      ],
    })
    const expected = await runQuery(
      engine,
      'SELECT round(sum(revenue), 2) FROM global_sales WHERE year(order_date) = 2025',
    )
    expect(tile.type).toBe('kpi')
    expect(tile.snapshot.rows[0]?.[0]).toBe(expected.rows[0]?.[0])
    expect(tile.snapshot.filtered).toBe(true)
    // The tile keeps its own SQL; filters are applied when it runs.
    expect(tile.sql).not.toContain('flashQuery_filtered')
  })

  it('keeps the chart the user chose while it fits, and re-picks when it does not', async () => {
    const first = await runTile(engine, { ...base, sql: BY_REGION, datasets: [sales] })
    const hbar = first.spec && { ...first.spec, type: 'hbar' as const, labels: true }
    const kept = await runTile(engine, { ...base, sql: BY_REGION, spec: hbar, datasets: [sales] })
    expect(kept.spec).toMatchObject({ type: 'hbar', labels: true })

    const changed = await runTile(engine, {
      ...base,
      sql: 'SELECT round(sum(revenue), 2) AS total FROM global_sales',
      spec: hbar,
      datasets: [sales],
    })
    expect(changed.spec?.type).toBe('kpi')
  })

  it('keeps the tile’s own colors through re-runs, and when the chart is re-picked', async () => {
    const first = await runTile(engine, { ...base, sql: BY_REGION, datasets: [sales] })
    const mono = first.spec && { ...first.spec, palette: 'mono' as const }
    const rerun = await runTile(engine, { ...base, sql: BY_REGION, spec: mono, datasets: [sales] })
    expect(rerun.spec?.palette).toBe('mono')
    const repicked = await runTile(engine, {
      ...base,
      sql: 'SELECT round(sum(revenue), 2) AS total FROM global_sales',
      spec: mono,
      datasets: [sales],
    })
    expect(repicked.spec).toMatchObject({ type: 'kpi', palette: 'mono' })
  })

  it('snapshots table tiles as rows', async () => {
    const tile = await runTile(engine, {
      ...base,
      asTable: true,
      sql: 'SELECT order_id, region FROM global_sales ORDER BY order_id',
      datasets: [sales],
    })
    expect(tile.type).toBe('table')
    expect(tile.snapshot).toMatchObject({ rowCount: 20_000, sampling: 'head' })
    expect(tile.snapshot.rows).toHaveLength(1_000)
  })

  it('refuses SQL the guard rejects (imported or AI tiles)', async () => {
    await expect(
      runTile(engine, { ...base, sql: 'DROP TABLE global_sales', datasets: [sales] }),
    ).rejects.toMatchObject({ code: 'guard_rejected' })
  })
})

describe('checkRefs (F-DASH-04)', () => {
  const ref = (over: object = {}) => ({
    table: 'sales',
    schemaHash: 'h1',
    label: 'Sales',
    fileName: 'sales.csv',
    sample: false,
    ...over,
  })

  it('says what to load when a table is missing or changed', () => {
    expect(checkRefs([], [])).toEqual({ ok: true })
    expect(checkRefs([ref()], [])).toEqual({
      ok: false,
      message: 'Re-upload sales.csv to refresh.',
    })
    expect(
      checkRefs(
        [ref({ table: 'global_sales', sample: true, label: 'Global Sales · 1M rows' })],
        [],
      ),
    ).toEqual({ ok: false, message: 'Load the Global Sales · 1M rows sample to refresh.' })
    expect(checkRefs([ref({ table: 'global_sales' })], [sales]).ok).toBe(false)
    expect(
      checkRefs([ref({ table: 'global_sales', schemaHash: sales.schemaHash })], [sales]),
    ).toEqual({ ok: true })
  })
})

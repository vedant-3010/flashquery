// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Engine } from '@/engine/connection'
import { runQuery } from '@/engine/query'
import { createTestEngine } from '@/test/duckdb'

// The store against real DuckDB (Node build) instead of the browser engine.
const engines: Engine[] = []
vi.mock('@/engine/duckdb', () => ({
  getDb: async () => {
    const current = engines.at(-1)
    if (current) return current
    const engine = await createTestEngine()
    engines.push(engine)
    return engine
  },
  restartDb: async () => {
    await engines.at(-1)?.terminate()
    const engine = await createTestEngine()
    engines.push(engine)
    return engine
  },
}))

const { useDatasetsStore } = await import('./datasets')

const state = () => useDatasetsStore.getState()
const csv = (name: string, text: string) => new File([text], name, { type: 'text/csv' })

async function settled() {
  await vi.waitFor(() => expect(state().jobs.filter((j) => j.status !== 'error')).toEqual([]), {
    timeout: 20_000,
  })
}

beforeEach(() => {
  engines.length = 0
  useDatasetsStore.setState({ datasets: [], jobs: [], restarting: false })
})

describe('datasets store', () => {
  it('loads files and samples into profiled datasets', async () => {
    state().addFiles([csv('Sales 2025.csv', 'region,amount\nNorth,10\nSouth,20\n')])
    state().loadSample('global-sales-10k')
    await settled()

    expect(state().datasets.map((d) => [d.label, d.table, d.rowCount])).toEqual([
      ['Sales 2025.csv', 'sales_2025', 2],
      ['Global Sales · 10k rows', 'global_sales', 10_000],
    ])
    const sales = state().datasets[0]
    expect(sales?.source).toMatchObject({ kind: 'file', format: 'csv', fileName: 'Sales 2025.csv' })
    expect(sales?.columns.map((c) => c.role)).toEqual(['geo', 'measure'])
  })

  it('renames, restarts the engine (re-ingesting everything) and removes', async () => {
    state().addFiles([csv('orders.csv', 'id,total\n1,5\n2,7\n')])
    await settled()
    const [orders] = state().datasets
    if (!orders) throw new Error('orders not loaded')

    await state().renameDataset(orders.id, { label: 'Orders', table: 'orders_2025' })
    await expect(
      state().renameDataset(orders.id, { label: 'Orders', table: 'order' }),
    ).rejects.toMatchObject({ code: 'invalid_table_name' })

    await state().restartEngine()
    expect(engines).toHaveLength(2)
    expect(state().datasets.map((d) => [d.id, d.label, d.table])).toEqual([
      [orders.id, 'Orders', 'orders_2025'],
    ])
    // The table exists in the new engine.
    const result = await runQuery(engines[1]!, 'SELECT sum(total) FROM orders_2025')
    expect(result.rows).toEqual([[12]])

    await state().removeDataset(orders.id)
    expect(state().datasets).toEqual([])
    await expect(runQuery(engines[1]!, 'SELECT * FROM orders_2025')).rejects.toMatchObject({
      code: 'duckdb',
    })
  })

  it('keeps a failed load as a retryable error, and skips bad rows on request', async () => {
    const rows = Array.from({ length: 20_500 }, (_, i) => `${i},${i}.5`).join('\n')
    state().addFiles([csv('bad.csv', `id,price\n${rows}\nx,oops\n`)])
    await vi.waitFor(() => expect(state().jobs[0]?.status).toBe('error'), { timeout: 20_000 })
    const [job] = state().jobs
    expect(job?.error?.code).toBe('csv_parse')

    state().retryJob(job!.id, { skipBadRows: true })
    await settled()
    expect(state().jobs).toEqual([])
    expect(state().datasets[0]?.source.skippedRows).toBe(1)
  })

  it('cancels a running load without leaving a dataset behind', async () => {
    state().loadSample('global-sales-10k')
    const [job] = state().jobs
    state().cancelJob(job!.id)
    await settled()
    expect(state().jobs).toEqual([])
    expect(state().datasets).toEqual([])
  })

  it('rejects unsupported files without retry', () => {
    state().addFiles([new File(['x'], 'slides.pptx')])
    expect(state().jobs[0]).toMatchObject({
      status: 'error',
      canRetry: false,
      error: { code: 'unsupported_type' },
    })
  })
})

// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AiLogEntry } from '@/ai/log'
import type { DashboardRequest, LLMProvider } from '@/ai/providers'
import { fixtureProvider } from '@/ai/providers/fixture'
import type { DashboardPlan } from '@/ai/schemas'
import type { Engine } from '@/engine/connection'
import { profileTable } from '@/engine/profile'
import { createGlobalSalesSql } from '@/engine/samples'
import type { DatasetProfile } from '@/engine/types'
import { createTestEngine } from '@/test/duckdb'
import { generateDashboard, type GenerateInput } from './dashboard'
import { buildDashboardMessages } from './prompts/planDashboard'

// F-DASH-09: the AI proposes tiles; each is guarded and run; demo mode uses a fixture.

let engine: Engine
let sales: DatasetProfile

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(createGlobalSalesSql(10_000))
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

function input(provider: LLMProvider, over: Partial<GenerateInput> = {}): GenerateInput {
  return {
    provider,
    engine,
    dataset: sales,
    datasets: [sales],
    mode: 'balanced',
    currency: null,
    today: '2026-10-02',
    signal: new AbortController().signal,
    ...over,
  }
}

function scripted(plan: DashboardPlan) {
  const requests: DashboardRequest[] = []
  const provider: LLMProvider = {
    ...fixtureProvider,
    id: 'anthropic',
    model: 'test-model',
    remote: true,
    async planDashboard(request) {
      requests.push(request)
      return { plan, usage: null }
    },
  }
  return { provider, requests }
}

describe('generateDashboard', () => {
  it('builds the demo dashboard from the fixture: 3 KPIs, a trend and 2 breakdowns', async () => {
    const progress: string[] = []
    const result = await generateDashboard(
      input(fixtureProvider, { onProgress: (p) => progress.push(p.stage) }),
    )
    expect(result.title).toBe('Global Sales overview')
    expect(result.failed).toEqual([])
    expect(result.tiles.map((t) => [t.title, t.type, t.spec?.type, t.size])).toEqual([
      ['Total revenue', 'kpi', 'kpi', 'kpi'],
      ['Orders', 'kpi', 'kpi', 'kpi'],
      ['Average order value', 'kpi', 'kpi', 'kpi'],
      ['Monthly revenue', 'chart', 'line', 'full'],
      ['Revenue by region', 'chart', 'bar', 'half'],
      ['Revenue share by channel', 'chart', 'donut', 'half'],
    ])
    expect(result.tiles.every((t) => t.snapshot.rows.length > 0)).toBe(true)
    expect(progress[0]).toBe('planning')
    expect(progress.at(-1)).toBe('done')
  })

  it('in demo mode, only builds dashboards for the sample', async () => {
    await expect(
      generateDashboard(input(fixtureProvider, { dataset: { ...sales, table: 'my_data' } })),
    ).rejects.toMatchObject({ code: 'demo_needs_sample' })
  })

  it('leaves out tiles that the guard rejects or that fail, and says why', async () => {
    const { provider, requests } = scripted({
      title: 'Mixed',
      tiles: [
        {
          title: 'Good',
          sql: 'SELECT count(*) AS n FROM global_sales',
          chartHint: null,
          size: 'kpi',
        },
        { title: 'Evil', sql: 'DROP TABLE global_sales', chartHint: null, size: 'half' },
        { title: 'Broken', sql: 'SELECT nope FROM global_sales', chartHint: null, size: 'half' },
      ],
    })
    const logs: AiLogEntry[] = []
    const result = await generateDashboard(input(provider, { onLog: (e) => logs.push(e) }))
    expect(result.tiles.map((t) => t.title)).toEqual(['Good'])
    expect(result.failed.map((f) => f.title)).toEqual(['Evil', 'Broken'])
    expect(result.failed[0]?.error).toMatch(/blocked/)
    expect(requests[0]?.table).toBe('global_sales')
    expect(logs[0]).toMatchObject({ purpose: 'dashboard', model: 'test-model', mode: 'balanced' })
    expect(logs[0]?.dataValues).toBeGreaterThan(0)
  })

  it('sends no data values in strict mode', async () => {
    const { provider } = scripted({
      title: 'One',
      tiles: [
        { title: 'n', sql: 'SELECT count(*) AS n FROM global_sales', chartHint: null, size: 'kpi' },
      ],
    })
    const logs: AiLogEntry[] = []
    await generateDashboard(input(provider, { mode: 'strict', onLog: (e) => logs.push(e) }))
    expect(logs[0]?.dataValues).toBe(0)
    expect(JSON.stringify(logs[0]?.messages)).not.toMatch(/topValues|sampleRows|APAC/)
  })
})

describe('buildDashboardMessages', () => {
  it('orders static instructions, schema context and the request (snapshot)', () => {
    const messages = buildDashboardMessages({
      context: { mode: 'strict', tables: [{ name: 'orders', rows: 3, columns: [] }] },
      table: 'orders',
      focus: 'margins',
      today: '2026-10-02',
    })
    expect(messages.map((m) => [m.role, m.cache ?? false])).toEqual([
      ['system', true],
      ['system', true],
      ['user', false],
    ])
    expect(messages[2]?.content).toBe(
      'Today is 2026-10-02.\n\nBuild a dashboard for the table orders.\n\nFocus on: margins',
    )
    expect(messages[0]?.content).toMatchSnapshot()
  })
})

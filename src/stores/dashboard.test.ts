import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardTile } from '@/dashboard/schema'
import { loadRecord, memoryStore, saveRecord } from '@/lib/idb'

// Engine-free: the store's bookkeeping, persistence and the dashboard file format.
vi.mock('@/engine/duckdb', () => ({
  getDb: () => Promise.reject(new Error('no engine in this test')),
}))

const { DASHBOARDS_RECORD, useDashboardStore } = await import('./dashboard')
const { exportDashboard, importDashboard } = await import('./dashboardJobs')

const state = () => useDashboardStore.getState()

const chartTile = (title: string): Omit<DashboardTile, 'id' | 'layout' | 'createdAt'> => ({
  type: 'chart',
  title,
  sql: 'SELECT 1 AS n',
  chartSpec: null,
  text: null,
  datasetRefs: [],
  snapshot: {
    columns: [{ name: 'n', duckType: 'INTEGER', logicalType: 'integer' }],
    rows: [[1]],
    rowCount: 1,
    sampling: 'none',
    at: 1,
    filtered: false,
  },
  question: null,
  edited: false,
})

beforeEach(() => {
  useDashboardStore.setState({ dashboards: [], activeId: null, status: {} })
})

describe('dashboard store', () => {
  it('creates "My dashboard" on first pin and auto-places tiles', () => {
    const id = state().ensureActive()
    expect(state().dashboards[0]?.name).toBe('My dashboard')
    expect(state().ensureActive()).toBe(id)
    state().addTile(id, chartTile('A'))
    state().addTile(id, chartTile('B'))
    state().addTile(id, { ...chartTile('KPI'), type: 'kpi' })
    expect(state().dashboards[0]?.tiles.map((t) => [t.title, t.layout])).toEqual([
      ['A', { x: 0, y: 0, w: 6, h: 4 }],
      ['B', { x: 6, y: 0, w: 6, h: 4 }],
      ['KPI', { x: 0, y: 4, w: 3, h: 2 }],
    ])
  })

  it('names new dashboards uniquely and falls back to another when one is deleted', () => {
    const first = state().createDashboard()
    const second = state().createDashboard()
    expect(state().dashboards.map((d) => d.name)).toEqual(['My dashboard', 'My dashboard 2'])
    expect(state().activeId).toBe(second)
    state().renameDashboard(second, '  Sales  ')
    expect(state().dashboards[1]?.name).toBe('Sales')
    state().deleteDashboard(second)
    expect(state().activeId).toBe(first)
  })

  it('duplicates, resizes, moves and removes tiles', () => {
    const id = state().ensureActive()
    const a = state().addTile(id, chartTile('A'))
    const b = state().addTile(id, chartTile('B'))
    const copy = state().duplicateTile(a)
    const tiles = () => state().dashboards[0]?.tiles ?? []
    expect(tiles().find((t) => t.id === copy)).toMatchObject({
      title: 'A (copy)',
      layout: { x: 0, y: 4, w: 6, h: 4 },
    })
    state().resizeTile(b, 'large')
    expect(tiles().find((t) => t.id === b)?.layout).toEqual({ x: 0, y: 0, w: 12, h: 5 })
    state().moveTile(copy ?? '', 'earlier')
    state().removeTile(a)
    expect(tiles().map((t) => t.title)).toEqual(['B', 'A (copy)'])
  })

  it('ignores layout reports that change nothing', () => {
    const id = state().ensureActive()
    const a = state().addTile(id, chartTile('A'))
    const before = state().dashboards
    state().setLayouts(id, new Map([[a, { x: 0, y: 0, w: 6, h: 4 }]]))
    expect(state().dashboards).toBe(before)
  })

  it('persists dashboards with their snapshots (F-DASH-03)', async () => {
    const id = state().ensureActive()
    state().addTile(id, chartTile('A'))
    const store = memoryStore()
    const { dashboards, activeId } = state()
    await saveRecord(DASHBOARDS_RECORD, { dashboards, activeId }, { store })
    const loaded = await loadRecord(DASHBOARDS_RECORD, { store })
    expect(loaded.dashboards[0]?.tiles[0]?.snapshot?.rows).toEqual([[1]])
    expect(loaded.activeId).toBe(id)
  })
})

describe('dashboard files (F-DASH-08)', () => {
  it('exports with or without data, and imports as a new dashboard with fresh ids', () => {
    const id = state().createDashboard('Sales overview')
    const tileId = state().addTile(id, chartTile('A'))
    const withData = exportDashboard(id, { snapshots: true })
    const withoutData = exportDashboard(id, { snapshots: false })
    expect(withData?.fileName).toBe('sales_overview.flashQuery.json')
    expect(JSON.parse(withoutData?.json ?? '{}').dashboard.tiles[0].snapshot).toBeNull()

    const imported = importDashboard(withData?.json ?? '')
    const copy = state().dashboards.find((d) => d.id === imported)
    expect(imported).not.toBe(id)
    expect(copy?.name).toBe('Sales overview 2')
    expect(copy?.tiles[0]?.id).not.toBe(tileId)
    expect(copy?.tiles[0]?.snapshot?.rows).toEqual([[1]])
    expect(state().activeId).toBe(imported)
  })

  it('refuses files that are not flashQuery dashboards', () => {
    expect(() => importDashboard('not json')).toThrow("This file isn't valid JSON.")
    expect(() => importDashboard('{"format":"other"}')).toThrow(/isn't an flashQuery dashboard/)
    const id = state().createDashboard()
    const file = JSON.parse(exportDashboard(id, { snapshots: true })?.json ?? '{}')
    file.dashboard.tiles = [{ ...chartTile('x'), id: 't', layout: { x: 99, y: 0, w: 1, h: 1 } }]
    expect(() => importDashboard(JSON.stringify(file))).toThrow(/isn't an flashQuery dashboard/)
  })
})

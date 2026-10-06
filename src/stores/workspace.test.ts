import { beforeEach, describe, expect, it } from 'vitest'
import { useDashboardStore } from './dashboard'
import { useHistoryStore } from './history'
import { useNotesStore } from './notes'
import { exportWorkspace, importWorkspace } from './workspace'

// F-EXP-03: one file with history, dashboards and notes; data only when opted in.

beforeEach(() => {
  useHistoryStore.setState({ entries: [] })
  useDashboardStore.setState({ dashboards: [], activeId: null, status: {} })
  useNotesStore.setState({ bySchema: {} })
})

function seed() {
  useHistoryStore.getState().add({
    kind: 'question',
    text: 'Revenue by region?',
    sql: 'SELECT 1',
    status: 'answered',
    headline: null,
    rowCount: 1,
  })
  const id = useDashboardStore.getState().createDashboard('Sales')
  useDashboardStore.getState().addTile(id, {
    type: 'kpi',
    title: 'Total',
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
  useNotesStore.getState().save('h1', { notes: 'Amounts in INR', columns: {} })
}

describe('workspace files', () => {
  it('leaves data out unless asked, and imports as additions', () => {
    seed()
    const plain = JSON.parse(exportWorkspace({ snapshots: false }).json)
    expect(plain.dashboards[0].tiles[0].snapshot).toBeNull()
    const full = exportWorkspace({ snapshots: true })
    expect(JSON.parse(full.json).dashboards[0].tiles[0].snapshot.rows).toEqual([[1]])

    useNotesStore.setState({ bySchema: {} })
    const added = importWorkspace(full.json)
    expect(added).toEqual({ history: 0, dashboards: 1, notes: 1 })
    expect(useDashboardStore.getState().dashboards.map((d) => d.name)).toEqual(['Sales', 'Sales 2'])
    expect(useHistoryStore.getState().entries).toHaveLength(1)
    expect(useNotesStore.getState().bySchema.h1?.notes).toBe('Amounts in INR')
  })

  it('refuses other files', () => {
    expect(() => importWorkspace('{"format":"flashQuery-dashboard"}')).toThrow(
      /isn't an flashQuery workspace/,
    )
    expect(() => importWorkspace('nope')).toThrow("This file isn't valid JSON.")
  })
})

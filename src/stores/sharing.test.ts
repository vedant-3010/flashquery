import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'

// F-SHARE-01/07 with a fake account service: what uploads, and how the dashboard here stays linked
// to its shared copy through first shares, updates, conflicts and stopping.

const service = vi.hoisted(() => ({
  saveDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  deleteDashboard: vi.fn(),
}))
vi.mock('@/platform/sharing', () => service)
vi.mock('@/engine/duckdb', () => ({
  getDb: () => Promise.reject(new Error('no engine in this test')),
}))

const { useDashboardStore } = await import('@/stores/dashboard')
const { forgetSharedCopy, publishDashboard, unpublishDashboard } = await import('@/stores/sharing')

const dashboards = () => useDashboardStore.getState()
const current = (id: string) => dashboards().dashboards.find((d) => d.id === id)

function withTile() {
  const id = dashboards().createDashboard('Sales review')
  dashboards().addTile(id, {
    type: 'kpi',
    title: 'Revenue',
    sql: 'SELECT sum(revenue) AS revenue FROM sales',
    chartSpec: null,
    text: null,
    datasetRefs: [
      { table: 'sales', schemaHash: 'h', label: 'sales', fileName: 'sales.csv', sample: false },
    ],
    snapshot: {
      columns: [{ name: 'revenue', duckType: 'DOUBLE', logicalType: 'number' }],
      rows: [[42]],
      rowCount: 1,
      sampling: 'none',
      at: 1,
      filtered: false,
    },
    question: 'Total revenue?',
    edited: false,
  })
  return id
}

beforeEach(() => {
  vi.clearAllMocks()
  useDashboardStore.setState({ dashboards: [], activeId: null, status: {} })
})

describe('sharing store', () => {
  it('uploads the shared document (no file names) and links the dashboard to its copy', async () => {
    const id = withTile()
    service.saveDashboard.mockResolvedValue({ id: 'cloud-1', version: 1 })
    const cloud = await publishDashboard(id)
    const [doc] = service.saveDashboard.mock.calls[0] ?? []
    expect(doc.tiles[0].datasetRefs).toEqual([])
    expect(JSON.stringify(doc)).not.toContain('sales.csv')
    expect(cloud).toMatchObject({ id: 'cloud-1', version: 1 })
    expect(current(id)?.cloud).toMatchObject({ id: 'cloud-1', version: 1 })
  })

  it('updates over the version it saved, and keeps the new one', async () => {
    const id = withTile()
    dashboards().setCloud(id, { id: 'cloud-1', version: 3, savedAt: 1 })
    service.updateDashboard.mockResolvedValue({ id: 'cloud-1', version: 4 })
    await publishDashboard(id)
    expect(service.updateDashboard).toHaveBeenCalledWith('cloud-1', expect.anything(), 3)
    expect(service.saveDashboard).not.toHaveBeenCalled()
    expect(current(id)?.cloud?.version).toBe(4)
  })

  it('leaves the link alone on a conflict, and forces only when asked', async () => {
    const id = withTile()
    dashboards().setCloud(id, { id: 'cloud-1', version: 3, savedAt: 1 })
    const conflict = new AppError({ code: 'share_conflict', message: 'newer', detail: null })
    service.updateDashboard.mockRejectedValueOnce(conflict)
    await expect(publishDashboard(id)).rejects.toBe(conflict)
    expect(current(id)?.cloud?.version).toBe(3)

    service.updateDashboard.mockResolvedValueOnce({ id: 'cloud-1', version: 6 })
    await publishDashboard(id, { force: true })
    expect(service.updateDashboard).toHaveBeenLastCalledWith('cloud-1', expect.anything(), null)
    expect(current(id)?.cloud?.version).toBe(6)
  })

  it('stops sharing: deletes the copy and unlinks; a lost copy is just forgotten', async () => {
    const id = withTile()
    dashboards().setCloud(id, { id: 'cloud-1', version: 1, savedAt: 1 })
    await unpublishDashboard(id)
    expect(service.deleteDashboard).toHaveBeenCalledWith('cloud-1')
    expect(current(id)?.cloud).toBeUndefined()

    dashboards().setCloud(id, { id: 'cloud-2', version: 1, savedAt: 1 })
    forgetSharedCopy(id)
    expect(current(id)?.cloud).toBeUndefined()
    expect(service.deleteDashboard).toHaveBeenCalledTimes(1)
  })
})

import { create } from 'zustand'
import type { ChartPalette } from '@/charts/spec'
import {
  DEFAULT_SIZES,
  moveTile as moveInLayout,
  placeTile,
  sizePreset,
  type SizePreset,
} from '@/dashboard/layout'
import {
  DashboardsRecordSchema,
  type Dashboard,
  type DashboardFile,
  type DashboardsRecord,
  type DashboardTile,
  type TileLayout,
} from '@/dashboard/schema'
import type { DashboardFilter } from '@/engine/filters'
import { loadRecord, saveRecord, type RecordSpec } from '@/lib/idb'
import { backupCorruptRecord } from '@/stores/persistence'

// Dashboards (F-DASH-01…10): tiles with their SQL, chart and last snapshot, saved in IndexedDB
// (F-DASH-03, debounced 500 ms). Running tiles lives in stores/dashboardJobs.ts.

export const DASHBOARDS_RECORD: RecordSpec<DashboardsRecord> = {
  key: 'dashboards',
  version: 1,
  schema: DashboardsRecordSchema,
  fallback: () => ({ dashboards: [], activeId: null }),
}

const SAVE_DELAY_MS = 500
export const DEFAULT_DASHBOARD_NAME = 'My dashboard'

/** A tile's state this session (not saved): its snapshot, being refreshed, live, or out of date. */
export interface TileStatus {
  state: 'snapshot' | 'refreshing' | 'live' | 'stale' | 'error'
  message: string | null
}

export type NewTile = Omit<DashboardTile, 'id' | 'layout' | 'createdAt'> & {
  layout?: Omit<TileLayout, 'x' | 'y'> & Partial<Pick<TileLayout, 'x' | 'y'>>
}

interface DashboardState {
  dashboards: Dashboard[]
  activeId: string | null
  hydrated: boolean
  status: Record<string, TileStatus>
  createDashboard: (name?: string, tiles?: DashboardTile[]) => string
  renameDashboard: (id: string, name: string) => void
  /** Colors for the dashboard's charts (F-VIZ-12); null: the default in Settings. */
  setPalette: (id: string, palette: ChartPalette | null) => void
  deleteDashboard: (id: string) => void
  setActive: (id: string) => void
  /** The active dashboard's id, creating "My dashboard" when there is none. */
  ensureActive: () => string
  addTile: (dashboardId: string, tile: NewTile) => string
  updateTile: (id: string, change: Partial<Omit<DashboardTile, 'id'>>) => void
  removeTile: (id: string) => void
  duplicateTile: (id: string) => string | null
  /** Layout from the grid (drag/resize), by tile id. */
  setLayouts: (dashboardId: string, layouts: ReadonlyMap<string, TileLayout>) => void
  resizeTile: (id: string, preset: SizePreset) => void
  moveTile: (id: string, direction: 'earlier' | 'later') => void
  setFilters: (dashboardId: string, filters: DashboardFilter[]) => void
  setStatus: (tileId: string, status: TileStatus) => void
  /** Adds an imported dashboard (fresh ids) and makes it active. */
  importDashboard: (file: DashboardFile) => string
  hydrate: () => Promise<void>
}

let counter = 0
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(counter += 1)}`

export function findTile(dashboards: Dashboard[], id: string) {
  for (const dashboard of dashboards) {
    const tile = dashboard.tiles.find((t) => t.id === id)
    if (tile) return { dashboard, tile }
  }
  return null
}

const sameLayout = (a: TileLayout, b: TileLayout) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

export const useDashboardStore = create<DashboardState>()((set, get) => {
  /** Applies `change` to one dashboard and bumps its updatedAt. */
  const patchDashboard = (id: string, change: (dashboard: Dashboard) => Dashboard) =>
    set((state) => ({
      dashboards: state.dashboards.map((d) =>
        d.id === id ? { ...change(d), updatedAt: Date.now() } : d,
      ),
    }))
  const patchTile = (id: string, change: (tile: DashboardTile) => DashboardTile) => {
    const found = findTile(get().dashboards, id)
    if (!found) return
    patchDashboard(found.dashboard.id, (d) => ({
      ...d,
      tiles: d.tiles.map((t) => (t.id === id ? change(t) : t)),
    }))
  }

  return {
    dashboards: [],
    activeId: null,
    hydrated: false,
    status: {},

    createDashboard: (name, tiles = []) => {
      const id = newId('dash')
      const taken = new Set(get().dashboards.map((d) => d.name))
      let unique = name?.trim() || DEFAULT_DASHBOARD_NAME
      for (let n = 2; taken.has(unique); n += 1)
        unique = `${name?.trim() || DEFAULT_DASHBOARD_NAME} ${n}`
      const now = Date.now()
      set((state) => ({
        dashboards: [
          ...state.dashboards,
          { id, name: unique, tiles, filters: [], createdAt: now, updatedAt: now },
        ],
        activeId: id,
      }))
      return id
    },

    renameDashboard: (id, name) => {
      if (name.trim()) patchDashboard(id, (d) => ({ ...d, name: name.trim().slice(0, 100) }))
    },

    setPalette: (id, palette) =>
      patchDashboard(id, ({ palette: _drop, ...d }) => (palette ? { ...d, palette } : d)),

    deleteDashboard: (id) =>
      set((state) => {
        const dashboards = state.dashboards.filter((d) => d.id !== id)
        const activeId = state.activeId === id ? (dashboards.at(-1)?.id ?? null) : state.activeId
        return { dashboards, activeId }
      }),

    setActive: (activeId) => set({ activeId }),

    ensureActive: () => {
      const { activeId, dashboards } = get()
      if (activeId && dashboards.some((d) => d.id === activeId)) return activeId
      const last = dashboards.at(-1)
      if (last) {
        set({ activeId: last.id })
        return last.id
      }
      return get().createDashboard()
    },

    addTile: (dashboardId, tile) => {
      const id = newId('tile')
      const dashboard = get().dashboards.find((d) => d.id === dashboardId)
      const size = tile.layout ?? DEFAULT_SIZES[tile.type]
      const layout =
        tile.layout?.x !== undefined && tile.layout.y !== undefined
          ? { x: tile.layout.x, y: tile.layout.y, w: size.w, h: size.h }
          : placeTile(dashboard?.tiles.map((t) => t.layout) ?? [], size)
      patchDashboard(dashboardId, (d) => ({
        ...d,
        tiles: [...d.tiles, { ...tile, id, layout, createdAt: Date.now() }],
      }))
      return id
    },

    updateTile: (id, change) => patchTile(id, (tile) => ({ ...tile, ...change })),

    removeTile: (id) => {
      const found = findTile(get().dashboards, id)
      if (!found) return
      patchDashboard(found.dashboard.id, (d) => ({
        ...d,
        tiles: d.tiles.filter((t) => t.id !== id),
      }))
    },

    duplicateTile: (id) => {
      const found = findTile(get().dashboards, id)
      if (!found) return null
      const { tile, dashboard } = found
      const copy = get().addTile(dashboard.id, {
        ...tile,
        title: `${tile.title} (copy)`,
        layout: { w: tile.layout.w, h: tile.layout.h },
      })
      const status = get().status[id]
      if (status) get().setStatus(copy, status)
      return copy
    },

    setLayouts: (dashboardId, layouts) => {
      const dashboard = get().dashboards.find((d) => d.id === dashboardId)
      if (!dashboard) return
      const changed = dashboard.tiles.some((t) => {
        const next = layouts.get(t.id)
        return next !== undefined && !sameLayout(next, t.layout)
      })
      if (!changed) return
      patchDashboard(dashboardId, (d) => ({
        ...d,
        tiles: d.tiles.map((t) => ({ ...t, layout: layouts.get(t.id) ?? t.layout })),
      }))
    },

    resizeTile: (id, preset) =>
      patchTile(id, (tile) => {
        const size = sizePreset(tile.type, preset)
        return {
          ...tile,
          layout: { ...tile.layout, ...size, x: Math.min(tile.layout.x, 12 - size.w) },
        }
      }),

    moveTile: (id, direction) => {
      const found = findTile(get().dashboards, id)
      if (!found) return
      const moved = moveInLayout(
        new Map(found.dashboard.tiles.map((t) => [t.id, t.layout])),
        id,
        direction,
      )
      get().setLayouts(found.dashboard.id, moved)
    },

    setFilters: (dashboardId, filters) => patchDashboard(dashboardId, (d) => ({ ...d, filters })),

    setStatus: (tileId, status) =>
      set((state) => ({ status: { ...state.status, [tileId]: status } })),

    importDashboard: (file) => {
      const tiles = file.dashboard.tiles.map((tile) => ({ ...tile, id: newId('tile') }))
      return get().createDashboard(file.dashboard.name, tiles)
    },

    hydrate: () => (hydrating ??= load()),
  }
})

let hydrating: Promise<void> | null = null
let saveTimer: number | undefined

/** Loads saved dashboards once, then saves (debounced) on every change. */
async function load() {
  const saved = await loadRecord(DASHBOARDS_RECORD, { onCorrupt: backupCorruptRecord }).catch(
    (error: unknown) => {
      console.warn('flashQuery: dashboards could not be loaded', error)
      return DASHBOARDS_RECORD.fallback()
    },
  )
  // Keep anything created before loading finished (e.g. a tile pinned right away).
  useDashboardStore.setState((state) => ({
    dashboards: [...saved.dashboards, ...state.dashboards],
    activeId: state.activeId ?? saved.activeId,
    hydrated: true,
  }))
  useDashboardStore.subscribe((state, previous) => {
    if (state.dashboards === previous.dashboards && state.activeId === previous.activeId) return
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      const { dashboards, activeId } = useDashboardStore.getState()
      saveRecord(DASHBOARDS_RECORD, { dashboards, activeId }).catch((error: unknown) =>
        console.warn('flashQuery: dashboards could not be saved', error),
      )
    }, SAVE_DELAY_MS)
  })
}

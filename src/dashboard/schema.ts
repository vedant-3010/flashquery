import { z } from '@/lib/zod'
import { ChartPaletteSchema, ChartSpecSchema } from '@/charts/spec'
import { DashboardFilterSchema } from '@/engine/filters'
import { CellValueSchema, ColumnMetaSchema } from '@/engine/types'

// Dashboards (docs/PRD.md §7, ui rules). Defined once here: persisted in IndexedDB (F-DASH-03),
// exported and imported as JSON (F-DASH-08), always parsed with these schemas on the way in.

export const TileTypeSchema = z.enum(['chart', 'kpi', 'table', 'text'])
export type TileType = z.infer<typeof TileTypeSchema>

export const MAX_SNAPSHOT_ROWS = 5_000
export const MAX_TILES = 60

export const TileLayoutSchema = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(10_000),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(40),
})
export type TileLayout = z.infer<typeof TileLayoutSchema>

/** A table a tile reads, as it was when the tile last ran (F-DASH-04 checks the schemaHash). */
export const DatasetRefSchema = z.object({
  table: z.string(),
  schemaHash: z.string(),
  label: z.string(),
  /** The file to re-upload; null for samples. */
  fileName: z.string().nullable(),
  sample: z.boolean(),
})
export type DatasetRef = z.infer<typeof DatasetRefSchema>

/** The tile's last result (≤ 5,000 rows): drawn instantly, before anything is re-run. */
export const SnapshotSchema = z.object({
  columns: z.array(ColumnMetaSchema),
  rows: z.array(z.array(CellValueSchema)).max(MAX_SNAPSHOT_ROWS),
  rowCount: z.number(),
  sampling: z.enum(['none', 'sample', 'step', 'bins', 'quantiles', 'head']),
  at: z.number(),
  /** Taken with the dashboard's filters applied. */
  filtered: z.boolean(),
})
export type Snapshot = z.infer<typeof SnapshotSchema>

export const DashboardTileSchema = z.object({
  id: z.string(),
  type: TileTypeSchema,
  title: z.string().max(200),
  sql: z.string().max(20_000).nullable(),
  chartSpec: ChartSpecSchema.nullable(),
  /** Text tiles: markdown. */
  text: z.string().max(20_000).nullable(),
  layout: TileLayoutSchema,
  datasetRefs: z.array(DatasetRefSchema),
  snapshot: SnapshotSchema.nullable(),
  /** The question it answered, if pinned from one. */
  question: z.string().nullable(),
  /** Pinned after the user edited the answer's SQL (J3). */
  edited: z.boolean(),
  createdAt: z.number(),
})
export type DashboardTile = z.infer<typeof DashboardTileSchema>

export const DashboardSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  tiles: z.array(DashboardTileSchema).max(MAX_TILES),
  filters: z.array(DashboardFilterSchema).max(4),
  /** Colors for its charts (F-VIZ-12); absent: the default in Settings. */
  palette: ChartPaletteSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Dashboard = z.infer<typeof DashboardSchema>

export const DashboardsRecordSchema = z.object({
  dashboards: z.array(DashboardSchema),
  activeId: z.string().nullable(),
})
export type DashboardsRecord = z.infer<typeof DashboardsRecordSchema>

/** The exported file (F-DASH-08). */
export const DashboardFileSchema = z.object({
  format: z.literal('flashQuery-dashboard'),
  version: z.literal(1),
  exportedAt: z.number(),
  dashboard: DashboardSchema,
})
export type DashboardFile = z.infer<typeof DashboardFileSchema>

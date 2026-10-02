import { z } from '@/lib/zod'

// Engine data shapes (docs/PRD.md §7). Everything that crosses into React, IndexedDB or JSON is one of
// these, so values are plain (no BigInt, no Arrow objects).

export const LogicalTypeSchema = z.enum([
  'number',
  'integer',
  'text',
  'date',
  'timestamp',
  'boolean',
  'other',
])
export type LogicalType = z.infer<typeof LogicalTypeSchema>

export const ColumnMetaSchema = z.object({
  name: z.string(),
  duckType: z.string(),
  logicalType: LogicalTypeSchema,
})
export type ColumnMeta = z.infer<typeof ColumnMetaSchema>

export const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
export type CellValue = z.infer<typeof CellValueSchema>

export const QueryResultSchema = z.object({
  columns: z.array(ColumnMetaSchema),
  /** Row-major, aligned with `columns`; at most the requested row cap. */
  rows: z.array(z.array(CellValueSchema)),
  /** Total rows the query returns, even when `rows` is truncated. */
  rowCount: z.number(),
  truncated: z.boolean(),
  elapsedMs: z.number(),
})
export type QueryResult = z.infer<typeof QueryResultSchema>

export const ColumnRoleSchema = z.enum([
  'id',
  'time',
  'measure',
  'category',
  'geo',
  'boolean',
  'text',
])
export type ColumnRole = z.infer<typeof ColumnRoleSchema>

export const ColumnProfileSchema = z.object({
  name: z.string(),
  /** DuckDB type as reported by DESCRIBE, e.g. "DECIMAL(18,2)". */
  type: z.string(),
  role: ColumnRoleSchema,
  nullPct: z.number(),
  /** Distinct non-null values: exact up to 100, a HyperLogLog estimate above. */
  approxDistinct: z.number(),
  /** Numbers for numeric columns, ISO strings for dates, text otherwise. */
  min: z.union([z.string(), z.number()]).nullable(),
  max: z.union([z.string(), z.number()]).nullable(),
  mean: z.number().nullable(),
  /** q25, q50, q75 for numeric columns. */
  quartiles: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  /** Up to 5 most frequent values for low-cardinality columns. */
  topValues: z.array(z.object({ value: z.string().nullable(), count: z.number() })),
  description: z.string().nullable(),
  unit: z.string().nullable(),
})
export type ColumnProfile = z.infer<typeof ColumnProfileSchema>

export const FileFormatSchema = z.enum(['csv', 'excel', 'parquet', 'json', 'generated'])
export type FileFormat = z.infer<typeof FileFormatSchema>

export const DatasetSourceSchema = z.object({
  kind: z.enum(['file', 'sample', 'paste']),
  format: FileFormatSchema,
  fileName: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  sheet: z.string().nullable(),
  /** What DuckDB's CSV sniffer detected (CSV/TSV and Excel sheets). */
  csv: z.object({ delimiter: z.string(), hasHeader: z.boolean() }).nullable(),
  /** Rows dropped by "skip bad rows". */
  skippedRows: z.number(),
})
export type DatasetSource = z.infer<typeof DatasetSourceSchema>

export const DatasetProfileSchema = z.object({
  id: z.string(),
  /** SQL table name: [a-z0-9_], unique in the catalog. */
  table: z.string(),
  /** Display name. */
  label: z.string(),
  source: DatasetSourceSchema,
  rowCount: z.number(),
  /** Hash of ordered column names + types; dashboards use it to detect schema changes. */
  schemaHash: z.string(),
  columns: z.array(ColumnProfileSchema),
  notes: z.string().nullable(),
  timings: z.object({ loadMs: z.number(), profileMs: z.number() }),
  createdAt: z.number(),
})
export type DatasetProfile = z.infer<typeof DatasetProfileSchema>

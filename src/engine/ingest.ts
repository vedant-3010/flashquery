import { z } from '@/lib/zod'
import type { Engine, SqlRunner } from '@/engine/connection'
import { ensureExtension } from '@/engine/extensions'
import { quoteIdent, quoteLiteral } from '@/engine/naming'
import { numberLike, tableToObjects } from '@/engine/normalize'
import { describeQuery } from '@/engine/query'
import type { DatasetSource } from '@/engine/types'
import { AppError } from '@/lib/errors'

// Files → DuckDB tables (F-DATA-01…04, 07). Files are registered by handle and read by DuckDB
// directly (never loaded whole into JS), under generated names so no user text reaches SQL literals.

export type IngestFormat = 'csv' | 'excel' | 'parquet' | 'json'

const FORMATS: Record<string, IngestFormat> = {
  csv: 'csv',
  tsv: 'csv',
  txt: 'csv',
  xlsx: 'excel',
  xls: 'excel',
  parquet: 'parquet',
  json: 'json',
  jsonl: 'json',
  ndjson: 'json',
}

/** For the file picker's `accept`. */
export const ACCEPTED_EXTENSIONS = Object.keys(FORMATS).map((extension) => `.${extension}`)

export function detectFormat(fileName: string): IngestFormat | null {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase()
  return (extension && FORMATS[extension]) || null
}

/** Size guardrails (rules: warn above 500 MB, suggest Parquet above 1 GB). */
export function sizeWarning(sizeBytes: number, format: IngestFormat): string | null {
  if (sizeBytes > 1e9 && format !== 'parquet') {
    return 'Over 1 GB: this may run out of memory. Parquet files load faster and use less.'
  }
  if (sizeBytes > 5e8) return 'Large file (over 500 MB): loading may take a while.'
  return null
}

/** CSV import overrides (F-DATA-08); null fields keep DuckDB's detection. */
export const CsvOptionsSchema = z.object({
  delimiter: z.string().min(1).max(4).nullable(),
  header: z.boolean().nullable(),
  skipRows: z.number().int().min(0).max(1_000_000),
  /** strptime format for DATE columns, e.g. "%d/%m/%Y". */
  dateFormat: z.string().max(40).nullable(),
  /** Load every column as text (VARCHAR). */
  allText: z.boolean(),
})
export type CsvOptions = z.infer<typeof CsvOptionsSchema>

export const DEFAULT_CSV_OPTIONS: CsvOptions = {
  delimiter: null,
  header: null,
  skipRows: 0,
  dateFormat: null,
  allText: false,
}

/** read_csv / sniff_csv parameters for the overrides that are set. */
export function csvParameters(options: CsvOptions | undefined): string {
  if (!options) return ''
  const parts: string[] = []
  if (options.delimiter !== null) parts.push(`delim = ${quoteLiteral(options.delimiter)}`)
  if (options.header !== null) parts.push(`header = ${options.header}`)
  if (options.skipRows > 0) parts.push(`skip = ${Math.floor(options.skipRows)}`)
  if (options.dateFormat) parts.push(`dateformat = ${quoteLiteral(options.dateFormat)}`)
  if (options.allText) parts.push('all_varchar = true')
  return parts.map((part) => `, ${part}`).join('')
}

export interface IngestOptions {
  /** CSV only: skip rows that don't parse instead of failing ("skip bad rows"). */
  ignoreErrors?: boolean
  /** CSV only: import overrides (F-DATA-08). */
  csv?: CsvOptions
  signal?: AbortSignal
}

export type IngestResult = Pick<DatasetSource, 'csv' | 'skippedRows'>

let fileCounter = 0
const virtualName = (extension: string) => `upload_${Date.now()}_${(fileCounter += 1)}.${extension}`

const SniffRowSchema = z.object({ Delimiter: z.string(), HasHeader: z.boolean() })

function ingestError(error: unknown, format: IngestFormat): unknown {
  if (!(error instanceof AppError) || error.code !== 'duckdb') return error
  const text = error.detail ?? error.message
  const line = /CSV Error on Line: (\d+)/.exec(text)?.[1]
  if (line) {
    return new AppError({
      code: 'csv_parse',
      message: `Row ${Number(line).toLocaleString()} couldn't be read. You can skip rows like it and load the rest.`,
      detail: text,
    })
  }
  if (/out of memory/i.test(text)) {
    return new AppError({
      code: 'out_of_memory',
      message:
        'The browser ran out of memory loading this file. Try a smaller file, or convert it to Parquet.',
      detail: text,
    })
  }
  return new AppError({
    code: 'ingest_failed',
    message: `This ${format === 'json' ? 'JSON' : format.toUpperCase()} file couldn't be loaded.`,
    detail: text,
  })
}

async function createFromCsv(
  runner: SqlRunner,
  table: string,
  name: string,
  { ignoreErrors = false, csv, signal }: IngestOptions,
): Promise<IngestResult> {
  const file = quoteLiteral(name)
  const overrides = csvParameters(csv)
  const [dialect] = tableToObjects(
    await runner.run(
      `SELECT Delimiter, HasHeader FROM sniff_csv(${file}, sample_size = 20480${overrides})`,
      signal,
    ),
    SniffRowSchema,
  )
  const rejects = `rejects_${table}`
  const errorOptions = ignoreErrors
    ? `, ignore_errors = true, store_rejects = true, rejects_table = ${quoteLiteral(rejects)}, rejects_scan = ${quoteLiteral(`${rejects}_scan`)}`
    : ''
  await runner.run(
    `CREATE TABLE ${quoteIdent(table)} AS SELECT * FROM read_csv(${file}, auto_detect = true, sample_size = 20480${overrides}${errorOptions})`,
    signal,
  )
  let skippedRows = 0
  if (ignoreErrors) {
    const [count] = tableToObjects(
      await runner.run(`SELECT count(DISTINCT line) AS n FROM ${quoteIdent(rejects)}`, signal),
      z.object({ n: numberLike }),
    )
    skippedRows = count?.n ?? 0
    await runner.run(`DROP TABLE IF EXISTS ${quoteIdent(rejects)}`)
    await runner.run(`DROP TABLE IF EXISTS ${quoteIdent(`${rejects}_scan`)}`)
  }
  return {
    csv: dialect ? { delimiter: dialect.Delimiter, hasHeader: dialect.HasHeader } : null,
    skippedRows,
  }
}

async function createFromJson(
  runner: SqlRunner,
  table: string,
  name: string,
  signal?: AbortSignal,
): Promise<IngestResult> {
  await ensureExtension(runner, 'json')
  const source = `read_json_auto(${quoteLiteral(name)})`
  // Nested values (STRUCT, LIST, MAP, JSON) are stored as JSON text so every column is queryable
  // with plain SQL (F-DATA-04 AC).
  const nested = (await describeQuery(runner, `SELECT * FROM ${source}`, signal)).filter(
    (column) => column.logicalType === 'other' || column.duckType === 'JSON',
  )
  const replace =
    nested.length > 0
      ? ` REPLACE (${nested.map((c) => `CAST(to_json(${quoteIdent(c.name)}) AS VARCHAR) AS ${quoteIdent(c.name)}`).join(', ')})`
      : ''
  await runner.run(`CREATE TABLE ${quoteIdent(table)} AS SELECT *${replace} FROM ${source}`, signal)
  return { csv: null, skippedRows: 0 }
}

async function createFromParquet(
  runner: SqlRunner,
  table: string,
  name: string,
  signal?: AbortSignal,
): Promise<IngestResult> {
  await ensureExtension(runner, 'parquet')
  await runner.run(
    `CREATE TABLE ${quoteIdent(table)} AS SELECT * FROM read_parquet(${quoteLiteral(name)})`,
    signal,
  )
  return { csv: null, skippedRows: 0 }
}

type TableFormat = Exclude<IngestFormat, 'excel'>

async function createTable(
  engine: Engine,
  table: string,
  name: string,
  format: TableFormat,
  options: IngestOptions,
): Promise<IngestResult> {
  try {
    switch (format) {
      case 'csv':
        return await createFromCsv(engine, table, name, options)
      case 'json':
        return await createFromJson(engine, table, name, options.signal)
      case 'parquet':
        return await createFromParquet(engine, table, name, options.signal)
    }
  } catch (error) {
    throw ingestError(error, format)
  } finally {
    await engine.dropFile(name)
  }
}

/** Creates `table` from a CSV/TSV, Parquet or JSON file. Excel goes through ingestCsvBytes. */
export async function ingestFile(
  engine: Engine,
  table: string,
  file: File,
  format: TableFormat,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const extension = format === 'csv' ? 'csv' : format === 'json' ? 'json' : 'parquet'
  const name = virtualName(extension)
  await engine.registerFile(name, file)
  return createTable(engine, table, name, format, options)
}

/** Creates `table` from CSV bytes (an Excel sheet or a bundled sample). The bytes are transferred. */
export async function ingestCsvBytes(
  engine: Engine,
  table: string,
  bytes: Uint8Array,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const name = virtualName('csv')
  await engine.registerBuffer(name, bytes)
  return createTable(engine, table, name, 'csv', options)
}

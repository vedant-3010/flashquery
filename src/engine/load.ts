import type { Engine } from '@/engine/connection'
import { ingestCsvBytes, ingestFile, type CsvOptions, type IngestResult } from '@/engine/ingest'
import { quoteIdent } from '@/engine/naming'
import { profileTable } from '@/engine/profile'
import { describeQuery } from '@/engine/query'
import { retypeColumn, type TypeOverride } from '@/engine/retype'
import { createGlobalSalesSql, type SampleDefinition } from '@/engine/samples'
import type { DatasetProfile, DatasetSource } from '@/engine/types'
import { abortError, AppError } from '@/lib/errors'
import { closeWorkbook, openWorkbook, workbookSheetToCsv } from '@/workers/clients'

// Any dataset input → a profiled table. Also used to re-ingest everything after "Restart engine".

export type DatasetInput =
  /** `csv`: import overrides (F-DATA-08). */
  | { kind: 'file'; file: File; format: 'csv' | 'parquet' | 'json'; csv?: CsvOptions }
  /** Tab-separated text pasted from a spreadsheet (F-DATA-10). */
  | { kind: 'paste'; text: string }
  /** `workbookId` reuses a workbook already parsed for the sheet picker. */
  | { kind: 'excel'; file: File; sheet: string; workbookId?: string }
  | { kind: 'sample'; sample: SampleDefinition }

export interface LoadRequest {
  id: string
  table: string
  label: string
  input: DatasetInput
  ignoreErrors?: boolean
  /** Column type overrides to apply after loading (F-DATA-09). */
  overrides?: readonly TypeOverride[]
  /** Re-import over an existing table: load into a temp table and swap only on success. */
  replace?: boolean
  signal?: AbortSignal
  onProfiling?: () => void
}

function checkAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw abortError(signal)
}

async function loadExcelSheet(
  engine: Engine,
  table: string,
  input: Extract<DatasetInput, { kind: 'excel' }>,
  ignoreErrors: boolean,
  signal?: AbortSignal,
): Promise<IngestResult> {
  const workbook = input.workbookId ?? (await openWorkbook(input.file)).id
  try {
    checkAborted(signal)
    const bytes = await workbookSheetToCsv(workbook, input.sheet)
    checkAborted(signal)
    return await ingestCsvBytes(engine, table, bytes, { ignoreErrors, signal })
  } finally {
    await closeWorkbook(workbook)
  }
}

async function loadSample(
  engine: Engine,
  table: string,
  sample: SampleDefinition,
  signal?: AbortSignal,
): Promise<IngestResult> {
  if (sample.kind === 'generated') {
    await engine.run(createGlobalSalesSql(sample.rows, table), signal)
    return { csv: null, skippedRows: 0 }
  }
  const response = await fetch(sample.path, { signal })
  if (!response.ok) {
    throw new AppError({
      code: 'sample_fetch',
      message: `Couldn't download the ${sample.label} sample.`,
      detail: `${response.status} ${response.statusText}`,
    })
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  await engine.run(`DROP TABLE IF EXISTS ${quoteIdent(table)}`, signal)
  return ingestCsvBytes(engine, table, bytes, { signal })
}

function describeSource(input: DatasetInput, result: IngestResult): DatasetSource {
  switch (input.kind) {
    case 'file':
      return {
        kind: 'file',
        format: input.format,
        fileName: input.file.name,
        sizeBytes: input.file.size,
        sheet: null,
        ...result,
      }
    case 'excel':
      return {
        kind: 'file',
        format: 'excel',
        fileName: input.file.name,
        sizeBytes: input.file.size,
        sheet: input.sheet,
        ...result,
        // The dialect is that of our own sheet-to-CSV conversion, not something the user chose.
        csv: null,
      }
    case 'paste':
      return {
        kind: 'paste',
        format: 'csv',
        fileName: null,
        sizeBytes: new TextEncoder().encode(input.text).length,
        sheet: null,
        ...result,
      }
    case 'sample':
      return {
        kind: 'sample',
        format: input.sample.kind === 'generated' ? 'generated' : 'csv',
        fileName: input.sample.kind === 'csv' ? input.sample.fileName : null,
        sizeBytes: null,
        sheet: null,
        ...result,
      }
  }
}

async function ingest(
  engine: Engine,
  table: string,
  input: DatasetInput,
  ignoreErrors: boolean,
  signal?: AbortSignal,
): Promise<IngestResult> {
  switch (input.kind) {
    case 'file':
      return ingestFile(engine, table, input.file, input.format, {
        ignoreErrors,
        csv: input.csv,
        signal,
      })
    case 'paste':
      return ingestCsvBytes(engine, table, new TextEncoder().encode(input.text), {
        ignoreErrors,
        csv: { delimiter: '\t', header: null, skipRows: 0, dateFormat: null, allText: false },
        signal,
      })
    case 'excel':
      return loadExcelSheet(engine, table, input, ignoreErrors, signal)
    case 'sample':
      return loadSample(engine, table, input.sample, signal)
  }
}

export async function loadDataset(engine: Engine, request: LoadRequest): Promise<DatasetProfile> {
  const { table, input, ignoreErrors = false, overrides = [], replace = false, signal } = request
  const loadStarted = performance.now()
  // A re-import loads beside the old table, which stays until the new one is complete.
  const target = replace ? `${table}__reimport` : table
  let result: IngestResult
  try {
    if (replace) await engine.run(`DROP TABLE IF EXISTS ${quoteIdent(target)}`)
    result = await ingest(engine, target, input, ignoreErrors, signal)
    if (overrides.length > 0) {
      // Overrides for columns a re-import no longer has are dropped, not errors.
      const names = new Set(
        (await describeQuery(engine, `SELECT * FROM ${quoteIdent(target)}`, signal)).map(
          (column) => column.name,
        ),
      )
      for (const override of overrides.filter((o) => names.has(o.column))) {
        await retypeColumn(engine, target, override, signal)
      }
    }
    if (replace) {
      await engine.run(`DROP TABLE IF EXISTS ${quoteIdent(table)}`)
      await engine.run(`ALTER TABLE ${quoteIdent(target)} RENAME TO ${quoteIdent(table)}`)
    }
  } catch (error) {
    if (replace) await engine.run(`DROP TABLE IF EXISTS ${quoteIdent(target)}`).catch(() => {})
    throw error
  }
  const loadMs = performance.now() - loadStarted

  request.onProfiling?.()
  const profileStarted = performance.now()
  try {
    const profile = await profileTable(engine, table, signal)
    return {
      id: request.id,
      table,
      label: request.label,
      source: describeSource(input, result),
      rowCount: profile.rowCount,
      schemaHash: profile.schemaHash,
      columns: profile.columns,
      notes: null,
      timings: { loadMs, profileMs: performance.now() - profileStarted },
      createdAt: Date.now(),
    }
  } catch (error) {
    // A table without a profile is invisible to the app; don't leave it behind.
    await engine.run(`DROP TABLE IF EXISTS ${quoteIdent(table)}`)
    throw error
  }
}

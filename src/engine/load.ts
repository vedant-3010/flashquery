import type { Engine } from '@/engine/connection'
import { ingestCsvBytes, ingestFile, type IngestResult } from '@/engine/ingest'
import { quoteIdent } from '@/engine/naming'
import { profileTable } from '@/engine/profile'
import { createGlobalSalesSql, type SampleDefinition } from '@/engine/samples'
import type { DatasetProfile, DatasetSource } from '@/engine/types'
import { abortError, AppError } from '@/lib/errors'
import { closeWorkbook, openWorkbook, workbookSheetToCsv } from '@/workers/clients'

// Any dataset input → a profiled table. Also used to re-ingest everything after "Restart engine".

export type DatasetInput =
  | { kind: 'file'; file: File; format: 'csv' | 'parquet' | 'json' }
  /** `workbookId` reuses a workbook already parsed for the sheet picker. */
  | { kind: 'excel'; file: File; sheet: string; workbookId?: string }
  | { kind: 'sample'; sample: SampleDefinition }

export interface LoadRequest {
  id: string
  table: string
  label: string
  input: DatasetInput
  ignoreErrors?: boolean
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

export async function loadDataset(engine: Engine, request: LoadRequest): Promise<DatasetProfile> {
  const { table, input, ignoreErrors = false, signal } = request
  const loadStarted = performance.now()
  let result: IngestResult
  switch (input.kind) {
    case 'file':
      result = await ingestFile(engine, table, input.file, input.format, { ignoreErrors, signal })
      break
    case 'excel':
      result = await loadExcelSheet(engine, table, input, ignoreErrors, signal)
      break
    case 'sample':
      result = await loadSample(engine, table, input.sample, signal)
      break
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

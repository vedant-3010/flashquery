import type { Engine } from '@/engine/connection'
import { ensureExtension } from '@/engine/extensions'
import { quoteLiteral } from '@/engine/naming'
import { trimStatement } from '@/engine/normalize'

// F-EXP-01: DuckDB writes the file (COPY ... TO an in-memory file), JS only hands the bytes to the
// browser as a download. Types are DuckDB's own, not the grid's display normalization.

export type ExportFormat = 'csv' | 'parquet'

export const EXPORT_MIME: Record<ExportFormat, string> = {
  csv: 'text/csv',
  parquet: 'application/vnd.apache.parquet',
}

let exportCounter = 0

export async function exportQuery(
  engine: Engine,
  sql: string,
  format: ExportFormat,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (format === 'parquet') await ensureExtension(engine, 'parquet')
  const name = `export_${(exportCounter += 1)}.${format}`
  // USE_TMP_FILE false: DuckDB would otherwise write "tmp_<name>" next to the working directory
  // and rename it, which escapes the in-memory file (and litters the disk under Node).
  const options = `${format === 'csv' ? 'FORMAT csv, HEADER' : 'FORMAT parquet'}, USE_TMP_FILE false`
  await engine.createFile(name)
  try {
    await engine.run(`COPY (${trimStatement(sql)}) TO ${quoteLiteral(name)} (${options})`, signal)
    return await engine.readFile(name)
  } finally {
    await engine.dropFile(name)
  }
}

import type { DatasetProfile } from '@/engine/types'
import { formatBytes, formatDuration, formatNumber } from '@/lib/format'

const DELIMITERS: Record<string, string> = {
  ',': 'comma',
  ';': 'semicolon',
  '\t': 'tab',
  '|': 'pipe',
}

/** One line on where a dataset came from and how it was read (F-DATA-02, F-DATA-06). */
export function sourceSummary(dataset: DatasetProfile, locale: string): string {
  const { source, timings } = dataset
  const parts: string[] = []
  if (source.format === 'generated') parts.push('Generated in your browser')
  else if (source.fileName) parts.push(source.fileName)
  if (source.sheet) parts.push(`sheet “${source.sheet}”`)
  if (source.sizeBytes !== null) parts.push(formatBytes(source.sizeBytes, locale))
  if (source.csv) {
    const delimiter = DELIMITERS[source.csv.delimiter] ?? `“${source.csv.delimiter}”`
    parts.push(`${delimiter}-separated`, source.csv.hasHeader ? 'header row' : 'no header row')
  }
  if (source.skippedRows > 0) {
    const rows = formatNumber(source.skippedRows, locale)
    parts.push(`${rows} bad ${source.skippedRows === 1 ? 'row' : 'rows'} skipped`)
  }
  parts.push(`loaded in ${formatDuration(timings.loadMs + timings.profileMs, locale)}`)
  return parts.join(' · ')
}

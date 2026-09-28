import type { CellValue } from '@/engine/types'

/** Rows that may be copied to the clipboard as TSV (F-EXP-01). */
export const TSV_MAX_ROWS = 10_000

function field(value: CellValue): string {
  if (value === null) return ''
  const text = String(value)
  // Quoted like Excel/Sheets expect when a value contains a tab, newline or quote.
  return /[\t\n\r"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Header row + rows as tab-separated text, pasteable into Excel or Google Sheets. */
export function toTsv(columns: string[], rows: CellValue[][]): string {
  const lines = [columns.map(field).join('\t'), ...rows.map((row) => row.map(field).join('\t'))]
  return `${lines.join('\n')}\n`
}

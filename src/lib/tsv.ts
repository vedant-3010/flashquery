import type { CellValue } from '@/engine/types'

/** Rows that may be copied to the clipboard as TSV (F-EXP-01). */
export const TSV_MAX_ROWS = 10_000

export function field(value: CellValue): string {
  if (value === null) return ''
  const text = String(value)
  // Quoted like Excel/Sheets expect when a value contains a tab, newline or quote.
  return /[\t\n\r"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Header row + rows as tab-separated text, pasteable into Excel or Google Sheets. */
export function toTsv(
  columns: string[],
  rows: CellValue[][],
  { header = true }: { header?: boolean } = {},
): string {
  const body = rows.map((row) => row.map(field).join('\t'))
  const lines = header ? [columns.map(field).join('\t'), ...body] : body
  return `${lines.join('\n')}\n`
}

/** Pasted text looks like spreadsheet cells: at least two lines and a tab in the first. */
export function looksLikeTable(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  return lines.length >= 2 && (lines[0] ?? '').includes('\t')
}

/** Rows (after the header) and columns of pasted TSV, for the paste preview. */
export function tsvShape(text: string): { rows: number; columns: number } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  return {
    rows: Math.max(0, lines.length - 1),
    columns: lines.length > 0 ? (lines[0] ?? '').split('\t').length : 0,
  }
}

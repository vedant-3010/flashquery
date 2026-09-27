import { transfer } from 'comlink'
import { read, utils, version, type CellObject, type WorkBook, type WorkSheet } from 'xlsx'

// Excel → CSV bytes for DuckDB (F-DATA-03). Runs inside xlsx.worker.ts; importable for tests.
// Workbooks stay parsed in the worker between open() and toCsv() so the sheet picker doesn't re-parse.

export interface SheetInfo {
  name: string
  /** Rows including the header row; 0 for an empty sheet. */
  rows: number
}

const books = new Map<string, WorkBook>()

function sheetRows(sheet: WorkSheet | undefined): number {
  const ref = sheet?.['!ref']
  if (!ref) return 0
  const range = utils.decode_range(ref)
  return range.e.r - range.s.r + 1
}

const pad = (value: number) => String(value).padStart(2, '0')

/** SheetJS date cells hold UTC-based Dates; rounds float noise (14:04:59.999) to the second. */
function isoDate(date: Date): string {
  const rounded = new Date(Math.round(date.getTime() / 1000) * 1000)
  const day = `${rounded.getUTCFullYear()}-${pad(rounded.getUTCMonth() + 1)}-${pad(rounded.getUTCDate())}`
  const [h, m, s] = [rounded.getUTCHours(), rounded.getUTCMinutes(), rounded.getUTCSeconds()]
  return h === 0 && m === 0 && s === 0 ? day : `${day} ${pad(h)}:${pad(m)}:${pad(s)}`
}

/** Replaces each date cell's display text ("3/1/25") with ISO text DuckDB can type-detect. */
function isoDates(sheet: WorkSheet): void {
  const rows: (CellObject | undefined)[][] | undefined = sheet['!data']
  for (const row of rows ?? []) {
    for (const cell of row ?? []) {
      if (cell?.t === 'd' && cell.v instanceof Date) cell.w = isoDate(cell.v)
    }
  }
}

export const xlsxApi = {
  init(): { version: string } {
    return { version }
  },

  open(buffer: ArrayBuffer): { id: string; sheets: SheetInfo[] } {
    const book = read(buffer, { dense: true, cellDates: true })
    const id = crypto.randomUUID()
    books.set(id, book)
    return {
      id,
      sheets: book.SheetNames.map((name) => ({ name, rows: sheetRows(book.Sheets[name]) })),
    }
  },

  /** The sheet as UTF-8 CSV (raw numbers, ISO dates), transferred rather than copied. */
  toCsv(id: string, sheetName: string): Uint8Array {
    const sheet = books.get(id)?.Sheets[sheetName]
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`)
    isoDates(sheet)
    const csv = utils.sheet_to_csv(sheet, { rawNumbers: true, blankrows: false })
    const bytes = new TextEncoder().encode(csv)
    return transfer(bytes, [bytes.buffer])
  },

  close(id: string): void {
    books.delete(id)
  },

  dispose(): void {
    books.clear()
  },
}

export type XlsxApi = typeof xlsxApi

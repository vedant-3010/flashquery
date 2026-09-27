import { transfer, wrap, type Remote } from 'comlink'
import type { SheetInfo, XlsxApi } from '@/workers/xlsx'

// Typed main-thread clients for our workers, created on first use.

let xlsx: { worker: Worker; api: Remote<XlsxApi> } | null = null

function xlsxClient(): Remote<XlsxApi> {
  if (!xlsx) {
    const worker = new Worker(new URL('./xlsx.worker.ts', import.meta.url), { type: 'module' })
    xlsx = { worker, api: wrap<XlsxApi>(worker) }
  }
  return xlsx.api
}

/** Parses an Excel file in the worker. Call closeWorkbook(id) when done. */
export async function openWorkbook(file: File): Promise<{ id: string; sheets: SheetInfo[] }> {
  const buffer = await file.arrayBuffer()
  return xlsxClient().open(transfer(buffer, [buffer]))
}

export function workbookSheetToCsv(id: string, sheet: string): Promise<Uint8Array> {
  return xlsxClient().toCsv(id, sheet)
}

export function closeWorkbook(id: string): Promise<void> {
  return xlsxClient().close(id)
}

export function disposeXlsxWorker(): void {
  xlsx?.worker.terminate()
  xlsx = null
}

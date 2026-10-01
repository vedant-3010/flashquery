import { proxy, transfer, wrap, type Remote } from 'comlink'
import { withDeadline } from '@/lib/deadline'
import type { PythonApi, PythonRunRequest, PythonRunResult } from '@/workers/python'
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

// ---- Python (Pyodide) ----

let python: { worker: Worker; api: Remote<PythonApi> } | null = null

function pythonClient(): Remote<PythonApi> {
  if (!python) {
    const worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })
    python = { worker, api: wrap<PythonApi>(worker) }
  }
  return python.api
}

/** Throws the Python session away (Stop, timeout); the next run starts a fresh one. */
export function resetPython(): void {
  python?.worker.terminate()
  python = null
}

export const PYTHON_TIMEOUT_MS = 60_000

/**
 * Runs approved analysis code in the Python worker. Pyodide can't be interrupted from outside, so
 * Stop and the timeout terminate the worker (F-PY-05); the error says the session was reset.
 */
export async function runPython(
  request: PythonRunRequest,
  {
    signal,
    timeoutMs = PYTHON_TIMEOUT_MS,
    onStatus,
    onLoaded,
  }: {
    signal?: AbortSignal
    timeoutMs?: number
    onStatus?: (message: string) => void
    /** Pyodide (with pandas) is ready. */
    onLoaded?: () => void
  },
): Promise<PythonRunResult> {
  const api = pythonClient()
  const status = onStatus ? proxy(onStatus) : undefined
  const work = (async () => {
    await api.init(status)
    onLoaded?.()
    const csv = request.csv
    return api.run(transfer({ ...request, csv }, [csv.buffer]), status)
  })()
  return withDeadline(work, { signal, timeoutMs, onGiveUp: resetPython })
}

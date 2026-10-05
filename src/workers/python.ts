import { loadPyodide, version, type PyodideAPI } from 'pyodide'
import {
  createNotebook,
  type NotebookCellResult,
  type NotebookStartRequest,
} from '@/workers/notebook'

// Python analysis (F-PY-01…05), inside python.worker.ts; importable for tests. Pyodide and its
// packages load from the pinned CDN (the installed package's own version), only when the user
// first runs Python. Generated code is untrusted (it comes from an LLM that saw data values): it
// runs only after the user approves it, in this worker, and with the network locked, so it can't
// send `df` anywhere (no fetch, XHR, WebSocket, EventSource or importScripts while it runs).

export const PYODIDE_VERSION = version
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`

/** Rows of `result` brought back (charts and tables take at most this many). */
export const MAX_RESULT_ROWS = 5_000
export const MAX_OUTPUT_CHARS = 20_000
const MAX_SUMMARY_CHARS = 1_000
const MAX_ERROR_CHARS = 4_000
const INPUT_PATH = '/home/pyodide/input.csv'

export interface PythonRunRequest {
  code: string
  /** The input rows as CSV with a header row. */
  csv: Uint8Array
  /** Input columns that pandas should parse as dates. */
  dateColumns: string[]
}

export type PythonRunResult =
  | {
      ok: true
      /** `result` as CSV (≤ 5,000 rows), or null when the code didn't assign one. */
      resultCsv: string | null
      /** Rows `result` had before it was cut to MAX_RESULT_ROWS. */
      resultRows: number | null
      summary: string | null
      stdout: string
    }
  | { ok: false; error: string; stdout: string }

export type StatusCallback = (message: string) => void

export interface PythonApi {
  /** Loads Pyodide and pandas once; later calls return the same promise. */
  init(onStatus?: StatusCallback): Promise<{ version: string }>
  run(request: PythonRunRequest, onStatus?: StatusCallback): Promise<PythonRunResult>
  /** Notebook cells (F-PY-06): see notebook.ts. */
  notebookStart(request: NotebookStartRequest): Promise<{ rows: number }>
  notebookRun(code: string): Promise<NotebookCellResult>
  notebookReset(): void
}

/** The network APIs a worker has; replaced by guarded versions (tests pass a fake scope). */
export interface NetworkScope {
  fetch?: (...args: never[]) => Promise<unknown>
  XMLHttpRequest?: unknown
  WebSocket?: unknown
  EventSource?: unknown
  importScripts?: (...urls: string[]) => void
}

const BLOCKED = 'Network access is turned off while analysis code runs.'

/**
 * Wraps the scope's network APIs so they fail while locked. Pyodide's own package loading runs
 * unlocked, before the user's code starts.
 */
export function guardNetwork(scope: NetworkScope) {
  let locked = false
  const fail = () => {
    throw new Error(BLOCKED)
  }
  const realFetch = scope.fetch
  if (realFetch) {
    scope.fetch = (...args: never[]) =>
      locked ? Promise.reject(new Error(BLOCKED)) : realFetch.apply(scope, args)
  }
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource'] as const) {
    const Real = scope[name] as (new (...args: unknown[]) => object) | undefined
    if (typeof Real !== 'function') continue
    scope[name] = new Proxy(Real, {
      construct(target, args) {
        if (locked) fail()
        return Reflect.construct(target, args) as object
      },
    })
  }
  const realImport = scope.importScripts
  if (realImport) {
    scope.importScripts = (...urls: string[]) => (locked ? fail() : realImport.apply(scope, urls))
  }
  return {
    lock: () => {
      locked = true
    },
    unlock: () => {
      locked = false
    },
    get locked() {
      return locked
    },
  }
}

/** Reads the input into `df`. */
export function preludeCode(dateColumns: readonly string[]): string {
  return [
    'import pandas as pd',
    `df = pd.read_csv(${JSON.stringify(INPUT_PATH)}, parse_dates=${JSON.stringify(dateColumns)})`,
  ].join('\n')
}

/** Collects `result` (a DataFrame, or a Series) and `summary` after the user's code ran. */
export const COLLECT_CODE = `
def __askdata_collect():
    import pandas as pd
    out = {"result": None, "rows": None, "summary": None, "error": None}
    r = globals().get("result")
    if isinstance(r, pd.Series):
        r = r.to_frame()
    if r is not None and not isinstance(r, pd.DataFrame):
        out["error"] = "result must be a pandas DataFrame, not " + type(r).__name__ + "."
        return out
    if r is not None:
        if not isinstance(r.index, pd.RangeIndex):
            r = r.reset_index()
        out["rows"] = len(r)
        r = r.head(${MAX_RESULT_ROWS})
        r.columns = [str(c) for c in r.columns]
        out["result"] = r.to_csv(index=False)
    s = globals().get("summary")
    if s is not None:
        out["summary"] = str(s)[:${MAX_SUMMARY_CHARS}]
    return out

__askdata_collect()
`

/** The traceback without Pyodide's own frames, and not too long. */
export function cleanTraceback(message: string, filename = '<analysis>'): string {
  const lines = message.split('\n')
  const start = lines.findIndex((line) => line.includes(`File "${filename}"`))
  const kept = start > 0 ? ['Traceback (most recent call last):', ...lines.slice(start)] : lines
  const text = kept.join('\n').trim()
  return text.length > MAX_ERROR_CHARS ? `…${text.slice(-MAX_ERROR_CHARS)}` : text
}

type Loader = (options: Parameters<typeof loadPyodide>[0]) => Promise<PyodideAPI>

export function createPythonApi({
  load = loadPyodide,
  indexURL = PYODIDE_INDEX_URL,
  packageBaseUrl,
  network,
}: {
  load?: Loader
  indexURL?: string
  /** Where packages come from when it differs from indexURL (Node tests). */
  packageBaseUrl?: string
  network?: ReturnType<typeof guardNetwork>
} = {}): PythonApi {
  let runtime: Promise<PyodideAPI> | null = null
  let output = ''
  const write = (text: string) => {
    if (output.length < MAX_OUTPUT_CHARS) output += `${text}\n`
  }

  /** Pyodide with pandas, loaded once (a failed load is retried on the next call). */
  function ready(onStatus?: StatusCallback): Promise<PyodideAPI> {
    runtime ??= (async () => {
      onStatus?.(`Downloading Python ${version} (about 12 MB, cached afterwards)…`)
      const pyodide = await load({
        indexURL,
        ...(packageBaseUrl ? { packageBaseUrl } : {}),
        stdout: write,
        stderr: write,
      })
      onStatus?.('Loading pandas…')
      await pyodide.loadPackage(['pandas'], { messageCallback: (m) => onStatus?.(m) })
      return pyodide
    })()
    runtime.catch(() => {
      runtime = null
    })
    return runtime
  }

  async function init(onStatus?: StatusCallback) {
    await ready(onStatus)
    return { version }
  }

  async function run(
    request: PythonRunRequest,
    onStatus?: StatusCallback,
  ): Promise<PythonRunResult> {
    const pyodide = await ready(onStatus)
    output = ''
    onStatus?.('Loading the packages the code imports…')
    await pyodide.loadPackagesFromImports(request.code, {
      messageCallback: (m) => onStatus?.(m),
    })
    pyodide.FS.writeFile(INPUT_PATH, request.csv)
    const namespace = pyodide.globals.get('dict')()
    try {
      onStatus?.('Running…')
      network?.lock()
      await pyodide.runPythonAsync(preludeCode(request.dateColumns), { globals: namespace })
      await pyodide.runPythonAsync(request.code, { globals: namespace, filename: '<analysis>' })
      const collected = await pyodide.runPythonAsync(COLLECT_CODE, { globals: namespace })
      const out = collected.toJs({ dict_converter: Object.fromEntries }) as {
        result: string | null
        rows: number | null
        summary: string | null
        error: string | null
      }
      collected.destroy()
      if (out.error) return { ok: false, error: out.error, stdout: output }
      return {
        ok: true,
        resultCsv: out.result,
        resultRows: out.rows,
        summary: out.summary,
        stdout: output,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: cleanTraceback(message), stdout: output }
    } finally {
      network?.unlock()
      namespace.destroy()
      try {
        pyodide.FS.unlink(INPUT_PATH)
      } catch {
        // Already gone.
      }
    }
  }

  const notebook = createNotebook({
    ready: () => ready(),
    network,
    output: {
      reset: () => {
        output = ''
      },
      read: () => output,
    },
    cleanTraceback,
  })

  return { init, run, ...notebook }
}

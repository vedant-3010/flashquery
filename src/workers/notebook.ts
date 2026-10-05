import type { PyodideAPI } from 'pyodide'
import type { PyCallable, PyProxy } from 'pyodide/ffi'

// Notebook cells (F-PY-06), in the Python worker: the user's own code, run cell by cell in one
// namespace that keeps its variables, with `df` loaded from a table or query. Each cell returns its
// output, its last expression (a small table or text) and any matplotlib figures as PNG data URLs.
// As for analysis code, packages load first and the network is locked while a cell runs.

export const NOTEBOOK_INPUT = '/home/pyodide/notebook.csv'
export const MAX_TABLE_ROWS = 50
export const MAX_FIGURES = 6
const MAX_TEXT = 5_000

export interface NotebookStartRequest {
  csv: Uint8Array
  dateColumns: string[]
}

export type NotebookValue =
  | { kind: 'table'; columns: string[]; rows: string[][]; totalRows: number }
  | { kind: 'text'; text: string }

export interface NotebookCellResult {
  ok: boolean
  stdout: string
  error: string | null
  /** The cell's last expression, or null. */
  value: NotebookValue | null
  /** matplotlib figures the cell drew, as PNG data URLs. */
  figures: string[]
}

/** Session set-up: plots render off-screen (Agg), and the helpers below exist. */
export const SESSION_CODE = `
import numbers, os
os.environ["MPLBACKEND"] = "Agg"
import pandas as pd

def __askdata_cell(v):
    try:
        return "" if pd.isna(v) else str(v)
    except (TypeError, ValueError):
        return str(v)

def __askdata_show(value):
    if value is None:
        return None
    if isinstance(value, pd.Series):
        value = value.to_frame()
    if isinstance(value, pd.DataFrame):
        frame = value if isinstance(value.index, pd.RangeIndex) else value.reset_index()
        head = frame.head(${MAX_TABLE_ROWS})
        return {
            "kind": "table",
            "columns": [str(c) for c in head.columns],
            "rows": [[__askdata_cell(v) for v in row] for row in head.itertuples(index=False)],
            "totalRows": len(frame),
        }
    # Numbers as a notebook prints them (1100, not np.int64(1100)); anything else as its repr.
    text = str(value) if isinstance(value, numbers.Number) else repr(value)
    return {"kind": "text", "text": text[:${MAX_TEXT}]}

def __askdata_figures():
    import sys
    if "matplotlib.pyplot" not in sys.modules:
        return []
    import base64, io
    import matplotlib.pyplot as plt
    out = []
    for num in plt.get_fignums()[:${MAX_FIGURES}]:
        buf = io.BytesIO()
        plt.figure(num).savefig(buf, format="png", dpi=100, bbox_inches="tight")
        out.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii"))
    plt.close("all")
    return out
`

export function loadDataCode(dateColumns: readonly string[]): string {
  return `df = pd.read_csv(${JSON.stringify(NOTEBOOK_INPUT)}, parse_dates=${JSON.stringify(dateColumns)})\nlen(df)`
}

interface Network {
  lock: () => void
  unlock: () => void
}

const isProxy = (value: unknown): value is PyProxy =>
  typeof value === 'object' && value !== null && 'toJs' in value && 'destroy' in value

export function createNotebook({
  ready,
  network,
  output,
  cleanTraceback,
}: {
  ready: () => Promise<PyodideAPI>
  network?: Network
  output: { reset: () => void; read: () => string }
  cleanTraceback: (message: string, filename: string) => string
}) {
  let namespace: PyProxy | null = null

  const toJs = (proxy: PyProxy): unknown => {
    const value = proxy.toJs({ dict_converter: Object.fromEntries })
    proxy.destroy()
    return value
  }

  async function figures(pyodide: PyodideAPI, globals: PyProxy): Promise<string[]> {
    const result: unknown = await pyodide.runPythonAsync('__askdata_figures()', { globals })
    return isProxy(result) ? (toJs(result) as string[]) : []
  }

  return {
    /** A fresh namespace with `df` loaded; returns its row count. */
    async notebookStart(request: NotebookStartRequest): Promise<{ rows: number }> {
      const pyodide = await ready()
      namespace?.destroy()
      namespace = pyodide.globals.get('dict')() as PyProxy
      pyodide.FS.writeFile(NOTEBOOK_INPUT, request.csv)
      try {
        await pyodide.runPythonAsync(SESSION_CODE, { globals: namespace })
        const rows: unknown = await pyodide.runPythonAsync(loadDataCode(request.dateColumns), {
          globals: namespace,
        })
        return { rows: Number(rows) }
      } finally {
        try {
          pyodide.FS.unlink(NOTEBOOK_INPUT)
        } catch {
          // Already gone.
        }
      }
    },

    async notebookRun(code: string): Promise<NotebookCellResult> {
      const globals = namespace
      if (!globals) {
        return {
          ok: false,
          stdout: '',
          error: 'Load data into df first.',
          value: null,
          figures: [],
        }
      }
      const pyodide = await ready()
      // Package downloads report through their own callback, not into the cell's output.
      await pyodide.loadPackagesFromImports(code, { messageCallback: () => undefined })
      output.reset()
      network?.lock()
      try {
        const raw: unknown = await pyodide.runPythonAsync(code, { globals, filename: '<cell>' })
        let value: NotebookValue | null = null
        if (isProxy(raw)) {
          const show = globals.get('__askdata_show') as PyCallable
          const shown: unknown = show(raw)
          show.destroy()
          raw.destroy()
          value = isProxy(shown) ? (toJs(shown) as NotebookValue) : null
        } else if (raw !== undefined && raw !== null) {
          value = { kind: 'text', text: String(raw) }
        }
        return {
          ok: true,
          stdout: output.read(),
          error: null,
          value,
          figures: await figures(pyodide, globals),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const drawn = await figures(pyodide, globals).catch(() => [])
        return {
          ok: false,
          stdout: output.read(),
          error: cleanTraceback(message, '<cell>'),
          value: null,
          figures: drawn,
        }
      } finally {
        network?.unlock()
      }
    },

    /** Forgets the notebook's variables. */
    notebookReset(): void {
      namespace?.destroy()
      namespace = null
    },
  }
}

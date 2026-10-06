import { describe, expect, it } from 'vitest'
import { createNotebook, loadDataCode, NOTEBOOK_INPUT } from './notebook'
import { guardNetwork } from './python'

// F-PY-06: cells share one namespace; packages load before the network is locked; the last
// expression and figures come back. (The real Pyodide run is in python.test.ts, opt-in.)

function fake(value: unknown) {
  const calls: string[] = []
  const network = guardNetwork({ fetch: async () => undefined })
  const proxy = (js: unknown) => ({ toJs: () => js, destroy: () => calls.push('destroy') })
  const namespace = {
    destroy: () => calls.push('destroy namespace'),
    get: () =>
      Object.assign(() => proxy({ kind: 'table', columns: ['a'], rows: [['1']], totalRows: 1 }), {
        destroy: () => undefined,
      }),
  }
  const runtime = {
    globals: { get: () => () => namespace },
    FS: {
      writeFile: (path: string) => calls.push(`write ${path}`),
      unlink: () => calls.push('unlink'),
    },
    loadPackagesFromImports: async () => calls.push(`imports (locked: ${network.locked})`),
    runPythonAsync: async (code: string, options: { filename?: string }) => {
      if (code === '__flashQuery_figures()') return proxy(['data:image/png;base64,AAAA'])
      if (code.startsWith('df = pd.read_csv')) return 3
      if (options.filename === '<cell>') {
        calls.push(`cell (locked: ${network.locked})`)
        if (code.includes('raise'))
          throw new Error('Traceback\n  File "<cell>", line 1\nNameError: x')
        return value
      }
      return undefined
    },
  }
  let output = ''
  const notebook = createNotebook({
    ready: async () => runtime as never,
    network,
    output: { reset: () => (output = ''), read: () => output },
    cleanTraceback: (message) => message.slice(message.indexOf('File')),
  })
  return { notebook, calls, network }
}

describe('notebook cells (F-PY-06)', () => {
  it('needs df loaded first', async () => {
    const { notebook } = fake(1)
    expect(await notebook.notebookRun('1 + 1')).toMatchObject({
      ok: false,
      error: 'Load data into df first.',
    })
  })

  it('loads df, then runs cells locked, returning the value and figures', async () => {
    const { notebook, calls, network } = fake(42)
    expect(await notebook.notebookStart({ csv: new Uint8Array(), dateColumns: ['day'] })).toEqual({
      rows: 3,
    })
    expect(calls).toEqual([`write ${NOTEBOOK_INPUT}`, 'unlink'])
    const result = await notebook.notebookRun('x = 41\nx + 1')
    expect(result).toEqual({
      ok: true,
      stdout: '',
      error: null,
      value: { kind: 'text', text: '42' },
      figures: ['data:image/png;base64,AAAA'],
    })
    expect(calls.slice(2, 4)).toEqual(['imports (locked: false)', 'cell (locked: true)'])
    expect(network.locked).toBe(false)
  })

  it('shows DataFrames as tables and errors as tracebacks', async () => {
    const proxyValue = { toJs: () => null, destroy: () => undefined }
    const { notebook } = fake(proxyValue)
    await notebook.notebookStart({ csv: new Uint8Array(), dateColumns: [] })
    expect((await notebook.notebookRun('df.head()')).value).toEqual({
      kind: 'table',
      columns: ['a'],
      rows: [['1']],
      totalRows: 1,
    })
    expect(await notebook.notebookRun('raise NameError')).toMatchObject({
      ok: false,
      error: 'File "<cell>", line 1\nNameError: x',
    })
  })

  it('parses date columns when loading df', () => {
    expect(loadDataCode(['day'])).toContain('parse_dates=["day"]')
  })
})

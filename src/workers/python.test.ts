// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadPyodide } from 'pyodide'
import { describe, expect, it } from 'vitest'
import { DEMO_FIXTURES } from '@/ai/fixtures'
import {
  cleanTraceback,
  createPythonApi,
  guardNetwork,
  preludeCode,
  PYODIDE_INDEX_URL,
  PYODIDE_VERSION,
  type NetworkScope,
} from './python'

// F-PY-02/04: the Python worker's logic. A fake runtime checks the order of things (packages load
// before the network is locked; the lock holds while user code runs). With RUN_PYODIDE=1 the real
// Pyodide runs the demo forecast (downloads ~20 MB from the CDN, so it's opt-in).

describe('guardNetwork', () => {
  it('blocks fetch, XHR, WebSocket and importScripts only while locked', async () => {
    class FakeSocket {}
    const scope: NetworkScope = {
      fetch: async () => 'response',
      XMLHttpRequest: class {},
      WebSocket: FakeSocket,
      importScripts: () => undefined,
    }
    const network = guardNetwork(scope)
    await expect(scope.fetch?.()).resolves.toBe('response')
    network.lock()
    await expect(scope.fetch?.()).rejects.toThrow('Network access is turned off')
    const Socket = scope.WebSocket as new () => object
    expect(() => new Socket()).toThrow('Network access is turned off')
    expect(() => scope.importScripts?.('https://evil.example/x.js')).toThrow()
    network.unlock()
    expect(new Socket()).toBeInstanceOf(FakeSocket)
  })
})

describe('worker helpers', () => {
  it('pins Pyodide to the installed version on the CDN', () => {
    expect(PYODIDE_INDEX_URL).toBe(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`)
  })

  it('reads the input with dates parsed', () => {
    expect(preludeCode(['month'])).toBe(
      'import pandas as pd\ndf = pd.read_csv("/home/pyodide/input.csv", parse_dates=["month"])',
    )
  })

  it('keeps only the analysis frames of a traceback', () => {
    const message = [
      'Traceback (most recent call last):',
      '  File "/lib/python3.14/site-packages/_pyodide/_base.py", line 1, in eval_code',
      '  File "<analysis>", line 3, in <module>',
      "KeyError: 'revenu'",
    ].join('\n')
    expect(cleanTraceback(message)).toBe(
      `Traceback (most recent call last):\n  File "<analysis>", line 3, in <module>\nKeyError: 'revenu'`,
    )
  })
})

describe('createPythonApi (fake runtime)', () => {
  function fakeRuntime() {
    const calls: string[] = []
    const network = guardNetwork({ fetch: async () => undefined })
    const proxy = (value: unknown) => ({
      toJs: () => value,
      destroy: () => calls.push('destroy result'),
    })
    const runtime = {
      loadPackage: async () => calls.push('load pandas'),
      loadPackagesFromImports: async () => calls.push(`imports (locked: ${network.locked})`),
      FS: { writeFile: () => calls.push('write input'), unlink: () => calls.push('unlink input') },
      globals: { get: () => () => ({ destroy: () => calls.push('destroy namespace') }) },
      runPythonAsync: async (code: string, options: { filename?: string }) => {
        calls.push(`run ${options.filename ?? 'harness'} (locked: ${network.locked})`)
        if (code.includes('raise'))
          throw new Error('Traceback\n  File "<analysis>", line 1\nValueError: no')
        return proxy({ result: 'a\n1\n', rows: 1, summary: 'One row.', error: null })
      },
    }
    const api = createPythonApi({
      load: async () => runtime as never,
      network,
    })
    return { api, calls, network }
  }

  it('loads packages before locking the network, then runs the code locked', async () => {
    const { api, calls, network } = fakeRuntime()
    const result = await api.run({ code: 'result = df', csv: new Uint8Array(), dateColumns: [] })
    expect(result).toEqual({
      ok: true,
      resultCsv: 'a\n1\n',
      resultRows: 1,
      summary: 'One row.',
      stdout: '',
    })
    expect(calls).toEqual([
      'load pandas',
      'imports (locked: false)',
      'write input',
      'run harness (locked: true)',
      'run <analysis> (locked: true)',
      'run harness (locked: true)',
      'destroy result',
      'destroy namespace',
      'unlink input',
    ])
    expect(network.locked).toBe(false)
  })

  it('returns the traceback when the code fails, and unlocks', async () => {
    const { api, network } = fakeRuntime()
    const result = await api.run({
      code: 'raise ValueError',
      csv: new Uint8Array(),
      dateColumns: [],
    })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('ValueError: no') })
    expect(network.locked).toBe(false)
  })
})

const forecast = DEMO_FIXTURES.find((f) => f.plan.kind === 'python')

describe.runIf(process.env.RUN_PYODIDE === '1')('real Pyodide', () => {
  it('runs the demo forecast and returns result + summary', async () => {
    const indexURL = `${dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))}/`
    const cache = mkdtempSync(join(tmpdir(), 'askdata-pyodide-'))
    const api = createPythonApi({
      indexURL,
      packageBaseUrl: PYODIDE_INDEX_URL,
      load: (options) => loadPyodide({ ...options, packageCacheDir: cache }),
      // As in the worker: the code can't reach the network (fetch is what pyfetch uses).
      network: guardNetwork(globalThis as unknown as NetworkScope),
    })
    const months = Array.from({ length: 48 }, (_, i) => {
      const date = new Date(Date.UTC(2022, i, 1)).toISOString().slice(0, 10)
      const revenue = 20_000_000 + i * 400_000 + (i % 12 >= 9 ? 3_000_000 : 0)
      return `${date},${revenue}`
    })
    const csv = new TextEncoder().encode(['month,revenue', ...months].join('\n'))
    const result = await api.run({ code: forecast?.plan.python ?? '', csv, dateColumns: ['month'] })
    if (!result.ok) throw new Error(result.error)
    const lines = result.resultCsv?.trim().split('\n') ?? []
    expect(lines[0]).toBe('month,actual,forecast')
    expect(lines).toHaveLength(1 + 48 + 3)
    expect(lines.at(-1)).toMatch(/^2026-03-01,,\d+(\.\d+)?$/)
    expect(result.summary).toMatch(
      /^Revenue is forecast at [\d.,]+M over the next 3 months \(Jan to Mar 2026\)/,
    )
    expect(result.stdout).toMatch(/^Trend: \+/)

    // Analysis code can't reach the network.
    const blocked = await api.run({
      code: 'from pyodide.http import pyfetch\nawait pyfetch("https://example.com")',
      csv,
      dateColumns: [],
    })
    expect(blocked).toMatchObject({
      ok: false,
      error: expect.stringContaining('Network access is turned off'),
    })
  }, 240_000)

  it('runs notebook cells that share variables and draw matplotlib figures (F-PY-06)', async () => {
    const indexURL = `${dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))}/`
    const cache = mkdtempSync(join(tmpdir(), 'askdata-pyodide-'))
    const api = createPythonApi({
      indexURL,
      packageBaseUrl: PYODIDE_INDEX_URL,
      load: (options) => loadPyodide({ ...options, packageCacheDir: cache }),
      network: guardNetwork(globalThis as unknown as NetworkScope),
    })
    await api.init()
    const csv = new TextEncoder().encode('region,revenue\nAPAC,300\nEMEA,200\nAPAC,50\n')
    expect(await api.notebookStart({ csv, dateColumns: [] })).toEqual({ rows: 3 })

    const first = await api.notebookRun(
      'total = df.revenue.sum()\nprint("total", total)\ndf.groupby("region").revenue.sum()',
    )
    expect(first).toMatchObject({ ok: true, stdout: 'total 550\n', figures: [] })
    expect(first.value).toEqual({
      kind: 'table',
      columns: ['region', 'revenue'],
      rows: [
        ['APAC', '350'],
        ['EMEA', '200'],
      ],
      totalRows: 2,
    })

    const plot = await api.notebookRun(
      'import matplotlib.pyplot as plt\nplt.bar(df.region, df.revenue)\nplt.title("Revenue")\ntotal * 2',
    )
    expect(plot).toMatchObject({ ok: true, value: { kind: 'text', text: '1100' } })
    expect(plot.figures).toHaveLength(1)
    expect(plot.figures[0]).toMatch(/^data:image\/png;base64,iVBORw0KGgo/)

    const failed = await api.notebookRun('undefined_name + 1')
    expect(failed).toMatchObject({ ok: false, error: expect.stringContaining('NameError') })
    expect(failed.error).toContain('File "<cell>"')
  }, 300_000)
})

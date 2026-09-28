import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createDuckDB,
  DuckDBDataProtocol,
  NODE_RUNTIME,
  VoidLogger,
} from '@duckdb/duckdb-wasm/blocking'
import { duckdbError, type Engine } from '@/engine/connection'
import { lockDown } from '@/engine/extensions'
import { abortError } from '@/lib/errors'

// A real DuckDB (same WASM build as the browser, blocking Node bindings) for engine unit tests.
// Use it from files marked `// @vitest-environment node`.

const dist = (file: string) =>
  fileURLToPath(new URL(`../../node_modules/@duckdb/duckdb-wasm/dist/${file}`, import.meta.url))

export async function createTestEngine(): Promise<Engine> {
  const db = await createDuckDB(
    {
      mvp: { mainModule: dist('duckdb-mvp.wasm'), mainWorker: dist('duckdb-node-mvp.worker.cjs') },
      eh: { mainModule: dist('duckdb-eh.wasm'), mainWorker: dist('duckdb-node-eh.worker.cjs') },
    },
    new VoidLogger(),
    NODE_RUNTIME,
  )
  await db.instantiate()
  db.open({})
  const conn = db.connect()

  // The Node runtime writes COPY output to the real disk (there are no in-memory files), so
  // createFile() maps each name to a temp dir and readFile() reads it back from there.
  const scratch = mkdtempSync(join(tmpdir(), 'askdata-engine-'))
  const files = new Map<string, string>()

  const engine: Engine = {
    version: db.getVersion(),
    run: async (sql, signal) => {
      if (signal?.aborted) throw abortError(signal)
      try {
        return conn.query(sql)
      } catch (error) {
        throw duckdbError(error)
      }
    },
    registerFile: async (name, file) =>
      db.registerFileBuffer(name, new Uint8Array(await file.arrayBuffer())),
    registerBuffer: async (name, bytes) => db.registerFileBuffer(name, bytes),
    createFile: async (name) => {
      const path = join(scratch, name)
      files.set(name, path)
      db.registerFileURL(name, path, DuckDBDataProtocol.NODE_FS, false)
    },
    readFile: async (name) => {
      const path = files.get(name) ?? (isAbsolute(name) ? name : null)
      // Relative names would be resolved against the working directory (the repo): refuse them.
      if (!path) throw new Error(`No such file: ${name}`)
      return new Uint8Array(readFileSync(path))
    },
    dropFile: async (name) => {
      db.dropFile(name)
      const path = files.get(name)
      if (path) rmSync(path, { force: true })
      files.delete(name)
    },
    terminate: async () => {
      conn.close()
      db.reset()
      rmSync(scratch, { recursive: true, force: true })
    },
  }
  await lockDown(engine)
  return engine
}

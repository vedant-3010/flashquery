import { createDuckDB, NODE_RUNTIME, VoidLogger } from '@duckdb/duckdb-wasm/blocking'
import { duckdbError, type Engine } from '@/engine/connection'
import { lockDown } from '@/engine/extensions'
import { abortError } from '@/lib/errors'

// A real DuckDB (same WASM build as the browser, blocking Node bindings) for engine unit tests.
// Use it from files marked `// @vitest-environment node`.

const dist = (file: string) =>
  decodeURIComponent(
    new URL(`../../node_modules/@duckdb/duckdb-wasm/dist/${file}`, import.meta.url).pathname,
  )

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
    dropFile: async (name) => db.dropFile(name),
    terminate: async () => {
      conn.close()
      db.reset()
    },
  }
  await lockDown(engine)
  return engine
}

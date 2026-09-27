import {
  AsyncDuckDB,
  DuckDBDataProtocol,
  selectBundle,
  VoidLogger,
  type AsyncDuckDBConnection,
} from '@duckdb/duckdb-wasm'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import { Table } from 'apache-arrow'
import { createSerialQueue, duckdbError, type Engine } from '@/engine/connection'
import { lockDown } from '@/engine/extensions'
import { abortError } from '@/lib/errors'

// Loaded via dynamic import from src/engine/duckdb.ts so DuckDB-WASM and Arrow stay out of the
// initial bundle. No coi bundle: we don't set COOP/COEP headers (PRD D5).

async function runCancellable(
  conn: AsyncDuckDBConnection,
  sql: string,
  signal: AbortSignal | undefined,
): Promise<Table> {
  if (signal?.aborted) throw abortError(signal)
  // send() runs as a pending query polled in steps, so a cancel request gets a chance to interrupt it.
  const cancel = () => {
    conn.cancelSent().catch(() => {
      // Nothing left to cancel; the query already finished.
    })
  }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const reader = await conn.send(sql, true)
    return new Table(await reader.readAll())
  } catch (error) {
    throw signal?.aborted ? abortError(signal) : duckdbError(error)
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

export async function createBrowserEngine(): Promise<Engine> {
  const bundle = await selectBundle({
    mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
    eh: { mainModule: ehWasm, mainWorker: ehWorker },
  })
  if (!bundle.mainWorker) throw new Error('DuckDB bundle has no worker script')

  const db = new AsyncDuckDB(new VoidLogger(), new Worker(bundle.mainWorker))
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
    await db.open({})
    const conn = await db.connect()
    const enqueue = createSerialQueue()
    const engine: Engine = {
      version: await db.getVersion(),
      run: (sql, signal) => enqueue(() => runCancellable(conn, sql, signal)),
      registerFile: (name, file) =>
        enqueue(() =>
          db.registerFileHandle(name, file, DuckDBDataProtocol.BROWSER_FILEREADER, true),
        ),
      registerBuffer: (name, bytes) => enqueue(() => db.registerFileBuffer(name, bytes)),
      readFile: (name) => enqueue(() => db.copyFileToBuffer(name)),
      dropFile: (name) =>
        enqueue(async () => {
          await db.dropFile(name)
        }),
      terminate: () => db.terminate(),
    }
    await lockDown(engine)
    return engine
  } catch (error) {
    await db.terminate()
    throw error
  }
}

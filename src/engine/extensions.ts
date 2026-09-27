import type { SqlRunner } from '@/engine/connection'

// F-SEC-02: after init, DuckDB may not install or load extensions on its own, so generated SQL can't
// pull in httpfs or anything else. The extensions we need are loaded explicitly, on first use
// (parquet and json are multi-MB downloads; loading them eagerly would blow the "DuckDB ready" budget).

export const LOCKDOWN_STATEMENTS = [
  'SET autoinstall_known_extensions = false',
  'SET autoload_known_extensions = false',
  'SET allow_community_extensions = false',
]

export async function lockDown(runner: SqlRunner): Promise<void> {
  for (const statement of LOCKDOWN_STATEMENTS) await runner.run(statement)
}

export type ExtensionName = 'parquet' | 'json'

const loaded = new WeakMap<SqlRunner, Map<ExtensionName, Promise<void>>>()

/** Installs and loads a core extension once per engine (from extensions.duckdb.org in the browser). */
export function ensureExtension(runner: SqlRunner, name: ExtensionName): Promise<void> {
  const perEngine = loaded.get(runner) ?? new Map<ExtensionName, Promise<void>>()
  loaded.set(runner, perEngine)
  let pending = perEngine.get(name)
  if (!pending) {
    pending = (async () => {
      await runner.run(`INSTALL ${name}`)
      await runner.run(`LOAD ${name}`)
    })()
    // Forget failures (e.g. offline) so the next attempt retries the download.
    pending.catch(() => perEngine.delete(name))
    perEngine.set(name, pending)
  }
  return pending
}

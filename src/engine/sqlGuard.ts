import { z } from 'zod'
import type { SqlRunner } from '@/engine/connection'
import { ensureExtension } from '@/engine/extensions'
import { quoteLiteral } from '@/engine/naming'
import { tableToObjects, trimStatement } from '@/engine/normalize'
import { AppError } from '@/lib/errors'

// F-SEC-01: every LLM-generated (or answer-edited) query passes here before it runs. DuckDB parses
// the SQL itself (json_serialize_sql), and the whole syntax tree is walked, so nothing hides in a
// subquery, CTE or join:
// - exactly one statement, and it must be a SELECT (json_serialize_sql refuses anything else:
//   INSERT, DROP, ATTACH, COPY, INSTALL, LOAD, SET, PRAGMA, CALL, ...)
// - every table is a loaded dataset or a CTE of the query (no file paths, URLs, system schemas)
// - table functions only from ALLOWED_TABLE_FUNCTIONS (no read_csv, read_parquet, glob, ...)
// - no scalar functions that reach outside the data (BLOCKED_FUNCTIONS)

export const ALLOWED_TABLE_FUNCTIONS = new Set(['range', 'generate_series', 'unnest'])

const BLOCKED_FUNCTIONS = new Set([
  'getenv',
  'query',
  'query_table',
  'read_text',
  'read_blob',
  'sniff_csv',
  'glob',
])

const AstSchema = z.union([
  z.object({ error: z.literal(true), error_message: z.string() }),
  z.object({ error: z.literal(false), statements: z.array(z.unknown()) }),
])

export interface GuardOptions {
  /** Tables the query may read (the loaded datasets). */
  tables: readonly string[]
  signal?: AbortSignal
}

function reject(reason: string, sql: string): never {
  throw new AppError({
    code: 'guard_rejected',
    message: `The query was blocked: ${reason}`,
    detail: sql,
  })
}

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function walk(value: unknown, visit: (node: Json) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
  } else if (isObject(value)) {
    visit(value)
    for (const child of Object.values(value)) walk(child, visit)
  }
}

/** CTE names defined anywhere in the query (scoping is not modelled; any CTE name is allowed). */
function cteNames(statement: unknown): Set<string> {
  const names = new Set<string>()
  walk(statement, (node) => {
    const map = isObject(node.cte_map) ? node.cte_map.map : undefined
    if (!Array.isArray(map)) return
    for (const entry of map) {
      if (isObject(entry) && typeof entry.key === 'string') names.add(entry.key.toLowerCase())
    }
  })
  return names
}

/** Checks a parsed statement; throws AppError `guard_rejected` with the first problem found. */
export function checkStatement(statement: unknown, tables: readonly string[], sql: string): void {
  const allowed = new Set(tables.map((table) => table.toLowerCase()))
  const ctes = cteNames(statement)

  walk(statement, (node) => {
    if (node.type === 'BASE_TABLE') {
      const name = String(node.table_name ?? '')
      const schema = String(node.schema_name ?? '').toLowerCase()
      const catalog = String(node.catalog_name ?? '').toLowerCase()
      if ((catalog !== '' && catalog !== 'memory') || (schema !== '' && schema !== 'main')) {
        reject(
          `it reads "${[catalog, schema, name].filter(Boolean).join('.')}", which isn't a loaded table.`,
          sql,
        )
      }
      if (!allowed.has(name.toLowerCase()) && !ctes.has(name.toLowerCase())) {
        reject(`it reads "${name}", which isn't a loaded table.`, sql)
      }
    } else if (node.type === 'TABLE_FUNCTION') {
      const fn = isObject(node.function) ? String(node.function.function_name ?? '') : ''
      if (!ALLOWED_TABLE_FUNCTIONS.has(fn.toLowerCase())) {
        reject(`it calls the table function ${fn}(), which isn't allowed.`, sql)
      }
    } else if (node.type === 'SHOW_REF') {
      reject('DESCRIBE, SHOW and SUMMARIZE are not allowed here.', sql)
    } else if (node.class === 'FUNCTION') {
      const fn = String(node.function_name ?? '').toLowerCase()
      if (BLOCKED_FUNCTIONS.has(fn) || fn.startsWith('read_')) {
        reject(`it calls ${fn}(), which isn't allowed.`, sql)
      }
    }
  })
}

/** Base tables a parsed statement reads (lower-case), not counting its own CTEs. */
export function tablesRead(statement: unknown): string[] {
  const ctes = cteNames(statement)
  const tables = new Set<string>()
  walk(statement, (node) => {
    if (node.type !== 'BASE_TABLE') return
    const name = String(node.table_name ?? '').toLowerCase()
    if (name && !ctes.has(name)) tables.add(name)
  })
  return [...tables]
}

/**
 * DuckDB's syntax tree for `sql` (json_serialize_sql): the whole document, for rewriting and
 * json_deserialize_sql, and its single statement. Rejects anything but one SELECT.
 */
export async function parseSelect(
  runner: SqlRunner,
  sql: string,
  signal?: AbortSignal,
): Promise<{ body: string; document: Json; statement: unknown }> {
  const body = trimStatement(sql)
  if (body === '') reject('it is empty.', sql)
  await ensureExtension(runner, 'json')
  const [row] = tableToObjects(
    await runner.run(
      `SELECT CAST(json_serialize_sql(${quoteLiteral(body)}) AS VARCHAR) AS ast`,
      signal,
    ),
    z.object({ ast: z.string() }),
  )
  const document: unknown = JSON.parse(row?.ast ?? '{}')
  const ast = AstSchema.safeParse(document)
  if (!ast.success || !isObject(document)) reject('DuckDB could not parse it.', sql)
  if (ast.data.error) {
    const message = ast.data.error_message
    reject(
      /only select/i.test(message)
        ? 'only a single SELECT query is allowed (no INSERT, DROP, ATTACH, COPY, SET, PRAGMA, …).'
        : `DuckDB could not parse it (${message}).`,
      sql,
    )
  }
  if (ast.data.statements.length !== 1) reject('it contains more than one statement.', sql)
  return { body, document, statement: ast.data.statements[0] }
}

/**
 * Parses `sql` with DuckDB and enforces the rules above. Returns the trimmed SQL on success;
 * rejects with AppError `guard_rejected` (the message says why, for the self-correction prompt).
 */
export async function guardSql(
  runner: SqlRunner,
  sql: string,
  options: GuardOptions,
): Promise<string> {
  const { body, statement } = await parseSelect(runner, sql, options.signal)
  checkStatement(statement, options.tables, body)
  return body
}

export { walk as walkAst, cteNames }
export type { Json as AstNode }

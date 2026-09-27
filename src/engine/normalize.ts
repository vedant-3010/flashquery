import type { Table } from 'apache-arrow'
import { z } from 'zod'
import { quoteIdent } from '@/engine/naming'
import type { CellValue, ColumnMeta, LogicalType } from '@/engine/types'

// DuckDB → plain JS. Types are normalized in SQL where possible (so Arrow hands back numbers, strings
// and booleans); the only JS-side conversion left is BigInt.

const INTEGER_TYPES = new Set([
  'TINYINT',
  'SMALLINT',
  'INTEGER',
  'BIGINT',
  'UTINYINT',
  'USMALLINT',
  'UINTEGER',
  'UBIGINT',
])

export function toLogicalType(duckType: string): LogicalType {
  const type = duckType.toUpperCase()
  if (INTEGER_TYPES.has(type)) return 'integer'
  if (/^(HUGEINT|UHUGEINT|FLOAT|DOUBLE|REAL|VARINT|BIGNUM|DECIMAL(\(.*\))?)$/.test(type))
    return 'number'
  if (type === 'BOOLEAN') return 'boolean'
  if (type === 'DATE') return 'date'
  if (/^TIMESTAMP(_S|_MS|_NS)?( WITH TIME ZONE)?$/.test(type)) return 'timestamp'
  if (type === 'VARCHAR' || type === 'UUID' || type === 'JSON' || type.startsWith('ENUM(')) {
    return 'text'
  }
  return 'other'
}

/**
 * Outer-SELECT expression that makes a column safe for JS: DECIMAL/HUGEINT → DOUBLE, dates and
 * timestamps → ISO-8601 text (UTC wall clock), everything exotic (LIST, STRUCT, INTERVAL, BLOB, ...) → text.
 */
export function normalizeExpression(column: { name: string; duckType: string }): string {
  const id = quoteIdent(column.name)
  const type = column.duckType.toUpperCase()
  let expression: string
  switch (toLogicalType(column.duckType)) {
    case 'integer':
    case 'boolean':
      expression = id
      break
    case 'number':
      expression = type === 'DOUBLE' || type === 'FLOAT' ? id : `CAST(${id} AS DOUBLE)`
      break
    case 'date':
      expression = `strftime(${id}, '%Y-%m-%d')`
      break
    case 'timestamp':
      expression = `strftime(CAST(${id} AS TIMESTAMP), '%Y-%m-%dT%H:%M:%S')`
      break
    case 'text':
      expression = type === 'VARCHAR' ? id : `CAST(${id} AS VARCHAR)`
      break
    case 'other':
      expression = `CAST(${id} AS VARCHAR)`
      break
  }
  return `${expression} AS ${id}`
}

/**
 * `sql` without trailing semicolons, whitespace and comments, so it can be wrapped in a subquery.
 * Scans strings and quoted identifiers so a `;` or `--` inside them is kept.
 */
export function trimStatement(sql: string): string {
  let end = 0
  let i = 0
  while (i < sql.length) {
    const char = sql[i]
    const next = sql[i + 1]
    if (char === '-' && next === '-') {
      const newline = sql.indexOf('\n', i)
      i = newline === -1 ? sql.length : newline
    } else if (char === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2)
      i = close === -1 ? sql.length : close + 2
    } else if (char === "'" || char === '"') {
      let j = i + 1
      while (j < sql.length && !(sql[j] === char && sql[j + 1] !== char)) {
        j += sql[j] === char ? 2 : 1
      }
      i = Math.min(j + 1, sql.length)
      end = i
    } else {
      if (char !== ';' && !/\s/.test(char ?? '')) end = i + 1
      i += 1
    }
  }
  return sql.slice(0, end)
}

/** Wraps `sql` in a normalizing SELECT, optionally capped at `limit` rows. */
export function buildNormalizedSelect(
  sql: string,
  columns: { name: string; duckType: string }[],
  limit?: number,
): string {
  const expressions = columns.length > 0 ? columns.map(normalizeExpression).join(', ') : '*'
  const limitClause = limit === undefined ? '' : `\nLIMIT ${Math.max(0, Math.floor(limit))}`
  return `SELECT ${expressions} FROM (\n${trimStatement(sql)}\n) AS q${limitClause}`
}

export function normalizeCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') {
    const asNumber = Number(value)
    return Number.isSafeInteger(asNumber) ? asNumber : value.toString()
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  // Anything else means a type slipped past normalizeExpression; show it rather than drop it.
  return String(value)
}

/** Arrow table → row-major plain values, in column order. */
export function tableToRows(table: Table): CellValue[][] {
  const vectors = Array.from({ length: table.numCols }, (_, index) => table.getChildAt(index))
  const rows: CellValue[][] = new Array(table.numRows)
  for (let row = 0; row < table.numRows; row += 1) {
    rows[row] = vectors.map((vector) => normalizeCell(vector?.get(row)))
  }
  return rows
}

/** Arrow table → objects validated by `schema` (for metadata queries: DESCRIBE, SUMMARIZE, ...). */
export function tableToObjects<T>(table: Table, schema: z.ZodType<T>): T[] {
  return table.toArray().map((row: { toJSON(): unknown }) => schema.parse(row.toJSON()))
}

/** Zod helper: counts and sizes arrive as BigInt or number depending on the DuckDB type. */
export const numberLike = z.union([z.number(), z.bigint()]).transform(Number)

export function toColumnMeta(name: string, duckType: string): ColumnMeta {
  return { name, duckType, logicalType: toLogicalType(duckType) }
}

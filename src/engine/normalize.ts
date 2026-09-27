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

/** Removes trailing semicolons and whitespace so the SQL can be wrapped in a subquery. */
export function stripTrailingSemicolons(sql: string): string {
  return sql.replace(/[\s;]+$/, '')
}

/**
 * Wraps `sql` in a normalizing SELECT. Newlines around the subquery keep a trailing `-- comment` in
 * `sql` from swallowing the closing parenthesis.
 */
export function buildNormalizedSelect(
  sql: string,
  columns: { name: string; duckType: string }[],
  limit?: number,
): string {
  const expressions = columns.length > 0 ? columns.map(normalizeExpression).join(', ') : '*'
  const limitClause = limit === undefined ? '' : `\nLIMIT ${Math.max(0, Math.floor(limit))}`
  return `SELECT ${expressions} FROM (\n${stripTrailingSemicolons(sql)}\n) AS q${limitClause}`
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

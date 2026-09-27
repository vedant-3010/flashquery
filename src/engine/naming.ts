// Identifiers and literals for SQL we build ourselves. User input never reaches SQL unquoted.

/** Double-quotes an identifier, escaping embedded quotes: my "col" → "my ""col""". */
export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/** Single-quotes a string literal: it's → 'it''s'. */
export function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

const MAX_TABLE_NAME = 63

/**
 * DuckDB keywords that can't be used as unquoted table names (duckdb_keywords(): reserved,
 * type_function and column_name categories). Generated SQL often doesn't quote table names, so
 * toTableName never produces one of these.
 */
const SQL_KEYWORDS = new Set(
  `all analyse analyze and any array as asc asymmetric both case cast check collate column constraint
  create default deferrable desc describe distinct do else end except false fetch for foreign from
  group having in initially intersect into lambda lateral leading limit not null offset on only or
  order pivot pivot_longer pivot_wider placing primary qualify references returning select show some
  summarize symmetric table then to trailing true union unique unpivot using variadic when where window
  with anti asof at authorization binary by collation columns concurrently cross freeze full generated
  glob ilike inner is isnull join left like map natural notnull outer overlaps positional right semi
  similar struct tablesample try_cast unpack verbose between bigint bit boolean char character coalesce
  dec decimal exists extract float grouping grouping_id inout int integer interval national nchar none
  nullif numeric out overlay position precision real row setof smallint substring time timestamp treat
  trim values varchar xmlattributes xmlconcat xmlelement xmlexists xmlforest xmlnamespaces xmlparse
  xmlpi xmlroot xmlserialize xmltable`.split(/\s+/),
)

/**
 * SQL-friendly table name from a label or file name: snake_case, [a-z0-9_] only, `t_` prefix when it
 * starts with a digit or is an SQL keyword, de-duplicated against `taken` (sales, sales_2, ...).
 */
export function toTableName(label: string, taken: Iterable<string> = []): string {
  const withoutExtension = label.replace(/\.[a-z0-9]{1,8}$/i, '')
  let base = withoutExtension
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_TABLE_NAME)
    .replace(/_+$/, '')
  if (base === '') base = 'dataset'
  if (/^[0-9]/.test(base) || SQL_KEYWORDS.has(base)) base = `t_${base}`

  const used = new Set(Array.from(taken, (name) => name.toLowerCase()))
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base}_${n}`
    if (!used.has(candidate)) return candidate
  }
}

/** True when `name` is a table name toTableName could have produced (for renames). */
export function isValidTableName(name: string): boolean {
  return /^[a-z_][a-z0-9_]{0,62}$/.test(name) && !SQL_KEYWORDS.has(name)
}

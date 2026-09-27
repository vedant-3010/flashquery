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
 * SQL-friendly table name from a label or file name: snake_case, [a-z0-9_] only, `t_` prefix when it
 * starts with a digit, de-duplicated against `taken` (sales, sales_2, ...).
 */
export function toTableName(label: string, taken: Iterable<string> = []): string {
  const withoutExtension = label.replace(/\.[a-z0-9]{1,8}$/i, '')
  let base = withoutExtension
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_TABLE_NAME)
    .replace(/_+$/, '')
  if (base === '') base = 'table'
  if (/^[0-9]/.test(base)) base = `t_${base}`

  const used = new Set(Array.from(taken, (name) => name.toLowerCase()))
  if (!used.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base}_${n}`
    if (!used.has(candidate)) return candidate
  }
}

/** True when `name` is already a valid table name as produced by toTableName. */
export function isValidTableName(name: string): boolean {
  return /^[a-z_][a-z0-9_]{0,62}$/.test(name)
}

import { z } from '@/lib/zod'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent, quoteLiteral } from '@/engine/naming'
import { numberLike, tableToObjects } from '@/engine/normalize'

// Column type override (F-DATA-09): converts a column in place with TRY_CAST (or try_strptime for a
// date format), so values that don't convert become NULL instead of failing the whole column.
// previewRetype() counts those values first; the UI shows the count before the user applies it.

export const RETYPE_TARGETS = [
  'VARCHAR',
  'BIGINT',
  'DOUBLE',
  'DATE',
  'TIMESTAMP',
  'BOOLEAN',
] as const

export const TypeOverrideSchema = z.object({
  column: z.string(),
  type: z.enum(RETYPE_TARGETS),
  /** strptime format for DATE/TIMESTAMP from text, e.g. "%d/%m/%Y"; null = TRY_CAST. */
  format: z.string().max(40).nullable(),
})
export type TypeOverride = z.infer<typeof TypeOverrideSchema>

export function conversionExpression({ column, type, format }: TypeOverride): string {
  const id = quoteIdent(column)
  if (format && (type === 'DATE' || type === 'TIMESTAMP')) {
    const parsed = `try_strptime(CAST(${id} AS VARCHAR), ${quoteLiteral(format)})`
    return type === 'DATE' ? `CAST(${parsed} AS DATE)` : parsed
  }
  return `TRY_CAST(${id} AS ${type})`
}

export interface RetypePreview {
  /** Non-null values. */
  total: number
  /** Non-null values that would become NULL. */
  failed: number
  /** A few values that don't convert. */
  examples: string[]
}

export async function previewRetype(
  runner: SqlRunner,
  table: string,
  override: TypeOverride,
  signal?: AbortSignal,
): Promise<RetypePreview> {
  const id = quoteIdent(override.column)
  const expression = conversionExpression(override)
  const [counts] = tableToObjects(
    await runner.run(
      `SELECT count(${id}) AS total, count(${id}) FILTER (WHERE ${expression} IS NULL) AS failed
       FROM ${quoteIdent(table)}`,
      signal,
    ),
    z.object({ total: numberLike, failed: numberLike }),
  )
  const examples = tableToObjects(
    await runner.run(
      `SELECT DISTINCT CAST(${id} AS VARCHAR) AS value FROM ${quoteIdent(table)}
       WHERE ${id} IS NOT NULL AND ${expression} IS NULL LIMIT 3`,
      signal,
    ),
    z.object({ value: z.string() }),
  ).map((row) => row.value)
  return { total: counts?.total ?? 0, failed: counts?.failed ?? 0, examples }
}

export async function retypeColumn(
  runner: SqlRunner,
  table: string,
  override: TypeOverride,
  signal?: AbortSignal,
): Promise<void> {
  await runner.run(
    `ALTER TABLE ${quoteIdent(table)} ALTER ${quoteIdent(override.column)} TYPE ${override.type}
     USING ${conversionExpression(override)}`,
    signal,
  )
}

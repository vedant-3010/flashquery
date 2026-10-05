import { z } from '@/lib/zod'
import type { SqlRunner } from '@/engine/connection'
import { trimStatement } from '@/engine/normalize'
import { AppError } from '@/lib/errors'

// Query plan view (F-EXPL-09): EXPLAIN (ANALYZE, FORMAT JSON) runs the query once and returns
// DuckDB's operator tree with timings and row counts. Only already-checked SQL comes here (an
// answer's SQL, or the user's own in the scratchpad). DuckDB's internal string (de)compression
// projections are folded away.

export interface PlanNode {
  name: string
  timingMs: number
  /** Rows the operator produced. */
  rows: number
  /** Rows read from storage (scans). */
  rowsScanned: number
  details: { label: string; value: string }[]
  children: PlanNode[]
}

export interface QueryPlan {
  totalMs: number
  /** Time spent in operators (their timings added up). */
  operatorMs: number
  root: PlanNode | null
}

interface RawNode {
  operator_name?: string
  operator_type?: string
  operator_timing?: number
  operator_cardinality?: number
  operator_rows_scanned?: number
  extra_info?: Record<string, unknown>
  children?: RawNode[]
  latency?: number
}

const RawNodeSchema: z.ZodType<RawNode> = z.lazy(() =>
  z.looseObject({
    operator_name: z.string().optional(),
    operator_type: z.string().optional(),
    operator_timing: z.number().optional(),
    operator_cardinality: z.number().optional(),
    operator_rows_scanned: z.number().optional(),
    extra_info: z.record(z.string(), z.unknown()).optional(),
    children: z.array(RawNodeSchema).optional(),
    latency: z.number().optional(),
  }),
)

const MAX_DETAIL = 160

function detailText(value: unknown): string {
  const text = Array.isArray(value) ? value.map(String).join(', ') : String(value)
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL - 1)}…` : text
}

/** DuckDB's own (de)compression projections: not something the query asked for. */
function isInternal(node: RawNode): boolean {
  const projections = node.extra_info?.Projections
  return (
    node.operator_type === 'PROJECTION' &&
    Array.isArray(projections) &&
    projections.some((p) => String(p).startsWith('__internal_')) &&
    (node.children?.length ?? 0) === 1
  )
}

function convert(node: RawNode): PlanNode[] {
  const children = (node.children ?? []).flatMap(convert)
  if (isInternal(node)) return children
  return [
    {
      name: node.operator_name ?? node.operator_type ?? 'Operator',
      timingMs: (node.operator_timing ?? 0) * 1000,
      rows: node.operator_cardinality ?? 0,
      rowsScanned: node.operator_rows_scanned ?? 0,
      details: Object.entries(node.extra_info ?? {})
        .filter(([, value]) => value !== '' && !(Array.isArray(value) && value.length === 0))
        .map(([label, value]) => ({ label, value: detailText(value) })),
      children,
    },
  ]
}

const sumTiming = (node: PlanNode): number =>
  node.timingMs + node.children.reduce((sum, child) => sum + sumTiming(child), 0)

export function parsePlan(json: string): QueryPlan {
  const top = RawNodeSchema.parse(JSON.parse(json))
  // top → EXPLAIN_ANALYZE → the query's root operator.
  const explain = top.children?.[0]
  const start = explain?.operator_type === 'EXPLAIN_ANALYZE' ? explain.children?.[0] : explain
  const root = start ? (convert(start)[0] ?? null) : null
  return {
    totalMs: (top.latency ?? 0) * 1000,
    operatorMs: root ? sumTiming(root) : 0,
    root,
  }
}

export async function explainAnalyze(
  runner: SqlRunner,
  sql: string,
  signal?: AbortSignal,
): Promise<QueryPlan> {
  const body = trimStatement(sql)
  if (body === '') {
    throw new AppError({
      code: 'empty_sql',
      message: 'There is no query to explain.',
      detail: null,
    })
  }
  const rows = (await runner.run(`EXPLAIN (ANALYZE, FORMAT JSON) ${body}`, signal)).toArray()
  const value = (rows[0] as { explain_value?: unknown } | undefined)?.explain_value
  if (typeof value !== 'string') {
    throw new AppError({
      code: 'plan_failed',
      message: "DuckDB didn't return a query plan.",
      detail: null,
    })
  }
  return parsePlan(value)
}

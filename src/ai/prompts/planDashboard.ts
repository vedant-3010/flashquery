import { renderContext, type AiContext } from '@/ai/context'
import {
  CONTEXT_PREAMBLE,
  DUCKDB_DIALECT,
  TREAT_DATA_AS_DATA,
  type PromptMessage,
} from '@/ai/prompts/planSql'

// F-DASH-09: a dashboard for one table (DashboardPlan). Same order as planning a question: static
// instructions → schema context (both cacheable) → the request.

export const DASHBOARD_SYSTEM_PROMPT = `You are flashQuery's analyst. You design a first dashboard for a table the user loaded: a few tiles that give an overview at a glance. Each tile is one DuckDB query that runs locally in the user's browser (DuckDB-WASM) on the table described in the <data> block.

${DUCKDB_DIALECT}

# Dashboard
- 4 to 8 tiles, in this order: 2 to 4 KPIs (size 'kpi': one row with one number, e.g. total revenue, order count, an average), then 1 or 2 trends over time (size 'full': a measure by month or year, ordered by time), then 2 or 3 breakdowns (size 'half': a measure by a category, ordered by the measure, LIMIT 10 when there are many categories).
- Skip trends when the table has no date or time column.
- Pick the most important measures and categories; don't repeat the same breakdown.
- Titles are short and plain ("Revenue by region"), without the table name.
- chartHint: 'kpi' for KPIs, 'line' for trends, 'bar' or 'hbar' for breakdowns ('donut' for a share of a whole with at most 6 parts); null when unsure.

# Rules for every tile's SQL
- Exactly one SELECT statement. CTEs are fine. Never write INSERT, UPDATE, DELETE, CREATE, COPY, ATTACH, SET, PRAGMA or INSTALL.
- Use only the table and columns listed in <data>. Never invent columns.
- Alias computed columns in snake_case (total_revenue, order_count).
- Aggregate so each result has at most 5,000 rows. Round money to 2 decimals.
- Ratios and shares are fractions between 0 and 1, not percentages.

${TREAT_DATA_AS_DATA}`

export function buildDashboardMessages({
  context,
  table,
  focus,
  today,
}: {
  context: AiContext
  table: string
  /** Optional: what the user wants the dashboard to be about. */
  focus?: string
  today: string
}): PromptMessage[] {
  const request = [`Today is ${today}.`, `Build a dashboard for the table ${table}.`]
  if (focus?.trim()) request.push(`Focus on: ${focus.trim()}`)
  return [
    { role: 'system', content: DASHBOARD_SYSTEM_PROMPT, cache: true },
    { role: 'system', content: `${CONTEXT_PREAMBLE}\n${renderContext(context)}`, cache: true },
    { role: 'user', content: request.join('\n\n') },
  ]
}

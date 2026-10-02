// The NL→SQL eval report (F-QA-04): evals/report.md, written by the runner (evals/run.eval.ts).
// Pure. Accuracy = passed / all questions (unanswerable ones pass when the model declines).

export const OUTCOMES = {
  pass: 'Correct',
  wrong_result: 'Wrong result',
  execution_error: 'SQL failed after retries',
  guard_rejected: 'Rejected by the SQL guard',
  model_error: 'Model or API error',
  no_sql: 'Asked to clarify or said unanswerable',
  python: 'Chose Python',
  answered_unanswerable: 'Answered an unanswerable question',
} as const
export type Outcome = keyof typeof OUTCOMES

export interface EvalResult {
  id: string
  dataset: string
  question: string
  outcome: Outcome
  /** Why it failed (row counts, missing columns, the error). */
  reason: string | null
  sql: string | null
  attempts: number
  tokens: number
  cost: number | null
  ms: number
}

export interface ReportMeta {
  model: string
  provider: string
  mode: string
  rows: number
  date: string
}

const pct = (part: number, whole: number) =>
  whole === 0 ? '—' : `${((100 * part) / whole).toFixed(1)}%`

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ')

export function accuracy(results: readonly EvalResult[]): number {
  return results.length === 0
    ? 0
    : results.filter((r) => r.outcome === 'pass').length / results.length
}

export function renderReport(results: readonly EvalResult[], meta: ReportMeta): string {
  const passed = results.filter((r) => r.outcome === 'pass').length
  const datasets = [...new Set(results.map((r) => r.dataset))]
  const tokens = results.reduce((sum, r) => sum + r.tokens, 0)
  const cost = results.reduce((sum, r) => sum + (r.cost ?? 0), 0)
  const repaired = results.filter((r) => r.outcome === 'pass' && r.attempts > 1).length
  const lines = [
    '# NL→SQL eval report',
    '',
    `${meta.date} · ${meta.provider} \`${meta.model}\` · ${meta.mode} mode · Global Sales ${meta.rows.toLocaleString('en-US')} rows`,
    '',
    `**Execution accuracy: ${passed}/${results.length} (${pct(passed, results.length)})**, ${repaired} after a self-correction. ` +
      `${tokens.toLocaleString('en-US')} tokens, ≈ $${cost.toFixed(2)}.`,
    '',
    '| Dataset | Correct | Accuracy |',
    '|---|---|---|',
    ...datasets.map((dataset) => {
      const rows = results.filter((r) => r.dataset === dataset)
      const ok = rows.filter((r) => r.outcome === 'pass').length
      return `| ${dataset} | ${ok}/${rows.length} | ${pct(ok, rows.length)} |`
    }),
    '',
    '| Outcome | Questions |',
    '|---|---|',
    ...Object.entries(OUTCOMES)
      .map(([key, label]) => [label, results.filter((r) => r.outcome === key).length] as const)
      .filter(([, count]) => count > 0)
      .map(([label, count]) => `| ${label} | ${count} |`),
    '',
    '## Questions',
    '',
    '| Id | Question | Outcome | Attempts | Seconds |',
    '|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.id} | ${cell(r.question)} | ${r.outcome === 'pass' ? '✅' : `❌ ${OUTCOMES[r.outcome]}`} | ${r.attempts} | ${(r.ms / 1000).toFixed(1)} |`,
    ),
  ]
  const failures = results.filter((r) => r.outcome !== 'pass')
  if (failures.length > 0) {
    lines.push('', '## Failures', '')
    for (const r of failures) {
      lines.push(`### ${r.id}: ${r.question}`, '', `${OUTCOMES[r.outcome]}: ${r.reason ?? '—'}`)
      if (r.sql) lines.push('', '```sql', r.sql, '```')
      lines.push('')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

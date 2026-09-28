import type { SqlPlan } from '@/ai/schemas'
import { useUiStore } from '@/stores/ui'

/** Plain-English explanation, assumptions, and the tables and columns used (F-EXPL-02). */
export function ExplanationTab({ plan }: { plan: SqlPlan }) {
  const highlightColumn = useUiStore((state) => state.highlightColumn)
  const columns = plan.columnsUsed.map((ref) => {
    const [table, column] = ref.includes('.') ? ref.split('.', 2) : [plan.tablesUsed[0] ?? '', ref]
    return { ref, table: table ?? '', column: column ?? ref }
  })

  return (
    <div className="grid gap-3 text-sm">
      <p>{plan.explanation}</p>
      {plan.assumptions.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">Assumptions</h4>
          <ul className="list-disc space-y-1 pl-5">
            {plan.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      )}
      {(plan.tablesUsed.length > 0 || columns.length > 0) && (
        <div>
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">Data used</h4>
          <ul className="flex flex-wrap gap-1.5" aria-label="Tables and columns used">
            {plan.tablesUsed.map((table) => (
              <li key={`t-${table}`}>
                <button
                  type="button"
                  className="rounded border px-1.5 py-0.5 font-mono text-xs hover:bg-muted"
                  onClick={() => highlightColumn(table, null)}
                >
                  {table}
                </button>
              </li>
            ))}
            {columns.map(({ ref, table, column }) => (
              <li key={`c-${ref}`}>
                <button
                  type="button"
                  title={`Show ${ref} in the sidebar`}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-muted/70"
                  onClick={() => highlightColumn(table, column)}
                >
                  {column}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

import { loadChartData, readChartRows } from '@/engine/chartData'
import { getDb } from '@/engine/duckdb'
import { openQuery } from '@/engine/paging'
import { toAppError } from '@/lib/errors'
import { useAskStore, type Answer } from '@/stores/ask'
import { useDashboardStore } from '@/stores/dashboard'
import { useDatasetsStore } from '@/stores/datasets'
import { useEngineStore } from '@/stores/engine'
import { useSqlStore } from '@/stores/sql'
import { useToastStore } from '@/stores/toast'

// "Restart engine" (F-PERF-03): the datasets store re-ingests every retained file into a fresh
// DuckDB; this then restores what lived in the old one: answers' result views (with their chart
// data), the SQL scratchpad's result, and live dashboard tiles. Python sessions start over.

async function reopenAnswer(answer: Answer): Promise<Partial<Answer> | null> {
  const engine = await getDb()
  if (answer.python) {
    const input = await openQuery(engine, answer.python.inputSql)
    const ran = answer.python.resultTable !== null
    return {
      ...(ran ? { status: 'python', result: null, chart: null, rows: [], summary: null } : {}),
      python: {
        ...answer.python,
        input,
        resultTable: null,
        phase: answer.python.phase === 'done' ? 'ready' : answer.python.phase,
        status: ran ? 'The engine restarted: run the Python code again for its result.' : null,
      },
    }
  }
  if (answer.status !== 'answered' || !answer.sql || !answer.result) return null
  const result = await openQuery(engine, answer.sql)
  const rows = await readChartRows(engine, result)
  if (!answer.chart) return { result, rows }
  const data = await loadChartData(engine, result, answer.chart.spec, rows)
  return { result, rows, chart: { ...answer.chart, data } }
}

/** Re-creates what the old engine held. Returns how many answers came back. */
async function restoreViews(): Promise<number> {
  let restored = 0
  for (const answer of useAskStore.getState().answers) {
    try {
      const change = await reopenAnswer(answer)
      if (!change) continue
      useAskStore.setState((state) => ({
        answers: state.answers.map((a) => (a.id === answer.id ? { ...a, ...change } : a)),
      }))
      restored += 1
    } catch (error) {
      useAskStore.setState((state) => ({
        answers: state.answers.map((a) =>
          a.id === answer.id
            ? {
                ...a,
                status: 'failed',
                result: null,
                error: {
                  code: 'restore_failed',
                  message: `This answer couldn't be restored after the engine restart: ${toAppError(error).message}`,
                  detail: a.sql,
                },
              }
            : a,
        ),
      }))
    }
  }

  const sql = useSqlStore.getState()
  if (sql.result && sql.resultSql) {
    try {
      const result = await openQuery(await getDb(), sql.resultSql)
      useSqlStore.setState({ result })
    } catch (error) {
      useSqlStore.setState({ result: null, error: toAppError(error).toJSON() })
    }
  }

  // Tiles keep their snapshots; the dashboard refreshes them from the reloaded tables.
  const dashboard = useDashboardStore.getState()
  for (const id of Object.keys(dashboard.status)) {
    dashboard.setStatus(id, { state: 'snapshot', message: null })
  }
  return restored
}

/** "Restart engine": reload every dataset, then restore views; a toast says what came back. */
export async function restartEngine(): Promise<void> {
  const datasets = useDatasetsStore.getState()
  await datasets.restartEngine()
  if (useEngineStore.getState().status !== 'ready') return
  const tables = useDatasetsStore.getState().datasets.length
  const answers = await restoreViews()
  const parts = [`${tables} ${tables === 1 ? 'table' : 'tables'} reloaded`]
  if (answers > 0) parts.push(`${answers} ${answers === 1 ? 'answer' : 'answers'} restored`)
  useToastStore.getState().show(`Engine restarted: ${parts.join(', ')}.`)
}

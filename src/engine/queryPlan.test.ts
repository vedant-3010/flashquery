// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { explainAnalyze, type PlanNode } from './queryPlan'
import { createGlobalSalesSql } from './samples'

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(createGlobalSalesSql(10_000))
})

const names = (node: PlanNode | null): string[] =>
  node ? [node.name, ...node.children.flatMap(names)] : []

describe('explainAnalyze (F-EXPL-09)', () => {
  it('returns the operator tree with timings, rows and details', async () => {
    const plan = await explainAnalyze(
      engine,
      `SELECT region, sum(revenue) AS revenue FROM global_sales
       WHERE year(order_date) = 2025 GROUP BY ALL ORDER BY revenue DESC;`,
    )
    const ops = names(plan.root)
    expect(ops[0]).not.toBe('EXPLAIN_ANALYZE')
    expect(ops).toContain('HASH_GROUP_BY')
    expect(ops).toContain('ORDER_BY')
    expect(ops.at(-1)).toMatch(/SCAN/)
    expect(plan.totalMs).toBeGreaterThan(0)
    expect(plan.operatorMs).toBeGreaterThan(0)

    const scan = (function find(node: PlanNode | null): PlanNode | null {
      if (!node) return null
      if (/SCAN/.test(node.name)) return node
      for (const child of node.children) {
        const hit = find(child)
        if (hit) return hit
      }
      return null
    })(plan.root)
    expect(scan?.rowsScanned).toBe(10_000)
    expect(scan?.details.find((d) => d.label === 'Table')?.value).toContain('global_sales')
    // DuckDB's internal string (de)compression projections are folded away.
    expect(JSON.stringify(plan)).not.toContain('__internal_')
  })

  it('rejects empty SQL', async () => {
    await expect(explainAnalyze(engine, '  ;  ')).rejects.toThrow('There is no query to explain.')
  })
})

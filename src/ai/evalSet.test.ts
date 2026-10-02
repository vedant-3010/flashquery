// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import type { Engine } from '@/engine/connection'
import { runQuery } from '@/engine/query'
import { guardSql } from '@/engine/sqlGuard'
import { createTestEngine } from '@/test/duckdb'
import { loadEvalDatasets, loadQuestions } from '@/test/evalData'

// The eval set itself (F-QA-04): ≥ 40 questions over two datasets, and every reference query
// passes the SQL guard and returns rows. Running the model on it needs a key: npm run evals.

const questions = loadQuestions()
let engine: Engine
let tables: string[]

beforeAll(async () => {
  engine = await createTestEngine()
  tables = [...(await loadEvalDatasets(engine)).keys()]
}, 60_000)

describe('eval questions', () => {
  it('cover two datasets with at least 40 answerable questions', () => {
    expect(new Set(questions.map((q) => q.dataset))).toEqual(new Set(tables))
    expect(questions.filter((q) => q.reference_sql !== null).length).toBeGreaterThanOrEqual(40)
  })

  it.each(questions.filter((q) => q.reference_sql !== null).map((q) => [q.id, q] as const))(
    '%s: the reference SQL is guarded and returns rows',
    async (_, question) => {
      const sql = await guardSql(engine, question.reference_sql ?? '', { tables })
      const result = await runQuery(engine, sql, { maxRows: 10_000 })
      expect(result.rows.length).toBeGreaterThan(0)
      expect(result.rows.flat().some((value) => value === null)).toBe(false)
    },
  )
})

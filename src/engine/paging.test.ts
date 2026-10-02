// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { setFilter, type ColumnFilter } from './gridFilters'
import {
  closeResult,
  countFiltered,
  exportSql,
  fetchPage,
  openQuery,
  openTable,
  pageSql,
  type PagedResult,
} from './paging'
import { runQuery } from './query'

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(`
    CREATE TABLE sales AS
    SELECT range AS id,
           ['b', 'a', 'c'][1 + range % 3] AS letter,
           CASE WHEN range % 10 = 0 THEN NULL ELSE range * 1.5 END AS amount,
           DATE '2025-01-01' + CAST(range % 30 AS INTEGER) AS day
    FROM range(1000)`)
})

afterAll(() => engine.terminate())

describe('pageSql', () => {
  const table: PagedResult = {
    relation: '"t"',
    viewName: null,
    byRowid: true,
    columns: [{ name: 'd', duckType: 'DATE', logicalType: 'date' }],
    rowCount: 10,
  }

  it('reads unsorted tables by rowid range', () => {
    expect(pageSql(table, { offset: 400, limit: 200, sorting: [] })).toBe(
      `SELECT strftime("d", '%Y-%m-%d') AS "d" FROM "t" WHERE rowid >= 400 AND rowid < 600 ORDER BY rowid`,
    )
  })

  it('sorts by the stored column, with rowid as a tie-breaker for tables', () => {
    expect(pageSql(table, { offset: 0, limit: 5, sorting: [{ column: 'd', desc: true }] })).toBe(
      `SELECT strftime("d", '%Y-%m-%d') AS "d" FROM "t" ORDER BY "t"."d" DESC NULLS LAST, rowid LIMIT 5 OFFSET 0`,
    )
  })

  it('pages views with LIMIT/OFFSET', () => {
    const view = { ...table, relation: '"result_1"', viewName: 'result_1', byRowid: false }
    expect(pageSql(view, { offset: 200, limit: 200, sorting: [] })).toBe(
      `SELECT strftime("d", '%Y-%m-%d') AS "d" FROM "result_1" LIMIT 200 OFFSET 200`,
    )
  })
})

describe('table paging', () => {
  it('opens a table and reads any page', async () => {
    const result = await openTable(engine, 'sales')
    expect(result.rowCount).toBe(1000)
    expect(result.columns.map((c) => c.name)).toEqual(['id', 'letter', 'amount', 'day'])

    const page = await fetchPage(engine, result, { offset: 998, limit: 200, sorting: [] })
    expect(page).toEqual([
      [998, 'c', 1497, '2025-01-09'],
      [999, 'b', 1498.5, '2025-01-10'],
    ])
  })

  it('sorts across pages without gaps or overlaps (multi-column, nulls last)', async () => {
    const result = await openTable(engine, 'sales')
    const sorting = [
      { column: 'letter', desc: false },
      { column: 'amount', desc: true },
    ]
    const pages = await Promise.all(
      [0, 200, 400, 600, 800].map((offset) =>
        fetchPage(engine, result, { offset, limit: 200, sorting }),
      ),
    )
    const rows = pages.flat()
    expect(rows).toHaveLength(1000)
    expect(new Set(rows.map((row) => row[0])).size).toBe(1000)
    expect(rows[0]).toEqual([997, 'a', 1495.5, '2025-01-08'])
    // Nulls sort last within each letter.
    const firstB = rows.findIndex((row) => row[1] === 'b')
    expect(rows[firstB - 1]?.[2]).toBeNull()
  })
})

describe('query paging', () => {
  it('wraps a query (CTEs, duplicate names) in a temp view and drops it on close', async () => {
    const result = await openQuery(
      engine,
      `WITH x AS (SELECT letter, count(*) AS n FROM sales GROUP BY letter)
       SELECT letter, n, n AS n FROM x ORDER BY letter; -- trailing comment`,
    )
    expect(result.columns.map((c) => c.name)).toEqual(['letter', 'n', 'n_1'])
    expect(result.rowCount).toBe(3)
    const rows = await fetchPage(engine, result, { offset: 0, limit: 200, sorting: [] })
    expect(rows).toEqual([
      ['a', 333, 333],
      ['b', 334, 334],
      ['c', 333, 333],
    ])
    await closeResult(engine, result)
    const views = await runQuery(
      engine,
      `SELECT count(*) FROM duckdb_views() WHERE view_name = '${result.viewName}'`,
    )
    expect(views.rows).toEqual([[0]])
  })

  it('refuses statements that are not a single query', async () => {
    for (const sql of [
      'DROP TABLE sales',
      'SELECT 1; DROP TABLE sales',
      'CREATE TABLE x (a INT)',
    ]) {
      await expect(openQuery(engine, sql)).rejects.toMatchObject({ code: 'duckdb' })
    }
    expect((await runQuery(engine, 'SELECT count(*) FROM sales')).rows).toEqual([[1000]])
    await expect(openQuery(engine, '  -- nothing\n')).rejects.toMatchObject({ code: 'empty_sql' })
  })

  it('reports binder errors when opening', async () => {
    await expect(openQuery(engine, 'SELECT nope FROM sales')).rejects.toMatchObject({
      code: 'duckdb',
      message: expect.stringContaining('Binder Error'),
    })
  })
})

describe('exportSql', () => {
  it('keeps the grid order and DuckDB types', async () => {
    const result = await openTable(engine, 'sales')
    expect(exportSql(result, [])).toBe('SELECT * FROM "sales" ORDER BY rowid')
    expect(exportSql(result, [{ column: 'id', desc: true }])).toBe(
      'SELECT * FROM "sales" ORDER BY "sales"."id" DESC NULLS LAST, rowid',
    )
  })
})

describe('column filters (F-GRID-04)', () => {
  const filters: ColumnFilter[] = [
    { column: 'letter', kind: 'values', values: ['a', 'b'] },
    { column: 'amount', kind: 'range', min: 100, max: null },
    { column: 'day', kind: 'dates', from: '2025-01-01', to: '2025-01-10' },
  ]

  it('pushes filters down, counts and pages the filtered rows', async () => {
    const result = await openTable(engine, 'sales')
    const expected = (
      await engine.run(`SELECT count(*) AS n FROM sales WHERE letter IN ('a', 'b')
        AND amount >= 100 AND day BETWEEN DATE '2025-01-01' AND DATE '2025-01-10'`)
    ).toArray()[0]?.n
    const count = await countFiltered(engine, result, filters)
    expect(count).toBe(Number(expected))
    const rows = (
      await Promise.all(
        [0, 200].map((offset) =>
          fetchPage(engine, result, { offset, limit: 200, sorting: [], filters }),
        ),
      )
    ).flat()
    expect(rows).toHaveLength(count)
    expect(rows.every((row) => row[1] !== 'c' && Number(row[2]) >= 100)).toBe(true)
    expect(rows[0]?.[0]).toBeLessThan(rows[1]?.[0] as number)
  })

  it('matches text case-insensitively and NULL on request; ignores empty filters', async () => {
    const result = await openTable(engine, 'sales')
    const nulls = setFilter([], { column: 'amount', kind: 'values', values: [null] })
    expect(await countFiltered(engine, result, nulls)).toBe(100)
    const text = setFilter([], { column: 'letter', kind: 'contains', text: 'A' })
    expect(await countFiltered(engine, result, text)).toBe(333)
    expect(setFilter(text, { column: 'letter', kind: 'contains', text: '' })).toEqual([])
    const injected = setFilter([], { column: 'letter', kind: 'contains', text: "a') OR (1=1" })
    expect(await countFiltered(engine, result, injected)).toBe(0)
    const exported = await runQuery(engine, exportSql(result, [], text), { maxRows: 1000 })
    expect(exported.rowCount).toBe(333)
  })
})

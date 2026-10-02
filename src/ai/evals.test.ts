import { describe, expect, it } from 'vitest'
import { compareResults, hasTopLevelOrderBy, parseQuestions, sameValue } from './evals'

const table = (columns: string[], rows: (string | number | boolean | null)[][]) => ({
  columns,
  rows,
})

describe('eval result comparison (F-QA-04)', () => {
  it('ignores column names, column order and extra columns', () => {
    const reference = table(
      ['region', 'revenue'],
      [
        ['APAC', 10],
        ['EU', 20],
      ],
    )
    const generated = table(
      ['total', 'orders', 'r'],
      [
        [20, 5, 'EU'],
        [10, 3, 'APAC'],
      ],
    )
    expect(compareResults(reference, generated, { ordered: false })).toEqual({ match: true })
    expect(compareResults(reference, generated, { ordered: true })).toMatchObject({ match: false })
  })

  it('compares whole rows, not just columns', () => {
    const reference = table(
      ['a', 'b'],
      [
        ['x', 1],
        ['y', 2],
      ],
    )
    const swapped = table(
      ['a', 'b'],
      [
        ['x', 2],
        ['y', 1],
      ],
    )
    expect(compareResults(reference, swapped, { ordered: false })).toEqual({
      match: false,
      reason: 'the same values, in different rows',
    })
  })

  it('reports row-count and missing-column mismatches', () => {
    const reference = table(['n'], [[1], [2]])
    expect(compareResults(reference, table(['n'], [[1]]), { ordered: false })).toEqual({
      match: false,
      reason: '1 rows, expected 2',
    })
    expect(compareResults(reference, table(['m'], [[3], [4]]), { ordered: false })).toEqual({
      match: false,
      reason: 'no column matches "n"',
    })
  })

  it('treats close and rounded numbers and midnight timestamps as equal', () => {
    expect(sameValue(1234.5678901, 1234.56789)).toBe(true)
    expect(sameValue(0.351234, 0.35)).toBe(true)
    expect(sameValue(35.12, 0.3512)).toBe(false)
    expect(sameValue('2024-03-01T00:00:00.000Z', '2024-03-01')).toBe(true)
    expect(sameValue('2024-03', '2024-03-01')).toBe(true)
    expect(sameValue(null, 0)).toBe(false)
  })

  it('finds a top-level ORDER BY only', () => {
    expect(hasTopLevelOrderBy('SELECT a FROM t ORDER BY a')).toBe(true)
    expect(hasTopLevelOrderBy('SELECT * FROM (SELECT a FROM t ORDER BY a)')).toBe(false)
    expect(hasTopLevelOrderBy("SELECT 'order by' AS x FROM t")).toBe(false)
    expect(hasTopLevelOrderBy('SELECT a, row_number() OVER (ORDER BY a) FROM t')).toBe(false)
  })

  it('parses JSON Lines and rejects duplicate ids', () => {
    const line = (id: string) =>
      JSON.stringify({ id, dataset: 't', question: 'q', reference_sql: 'SELECT 1', notes: null })
    expect(parseQuestions(`${line('a')}\n\n${line('b')}\n`)).toHaveLength(2)
    expect(() => parseQuestions(`${line('a')}\n${line('a')}`)).toThrow('Duplicate eval id a')
  })
})

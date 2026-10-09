import { describe, expect, it } from 'vitest'
import { checkResult, describeFinding } from '@/ai/resultCheck'

const columns = (...names: string[]) => names.map((name) => ({ name }))

describe('checkResult', () => {
  it('flags an empty result', () => {
    const finding = checkResult({
      question: 'Revenue in Narnia',
      sql: 'SELECT 1',
      columns: columns('revenue'),
      rows: [],
      rowCount: 0,
    })
    expect(finding?.problem).toBe('No rows came back')
  })

  it('flags columns that are NULL in every row, naming them separately', () => {
    const finding = checkResult({
      question: 'Revenue by region',
      sql: 'SELECT region, TRY_CAST(x AS DOUBLE) AS revenue FROM t GROUP BY ALL',
      columns: columns('region', 'revenue'),
      rows: [
        ['North', null],
        ['South', null],
      ],
      rowCount: 2,
    })
    expect(finding).toMatchObject({
      problem: 'A column is NULL in every row',
      columns: ['revenue'],
    })
    expect(finding && describeFinding(finding)).toBe('A column is NULL in every row: revenue')
  })

  it('ignores NULL columns when only the first rows are known', () => {
    const finding = checkResult({
      question: 'Revenue by region',
      sql: 'SELECT 1',
      columns: columns('region', 'change'),
      rows: [['North', null]],
      rowCount: 9000,
    })
    expect(finding).toBeNull()
  })

  it('lets a single row keep a NULL change, but not an all-NULL aggregate', () => {
    const base = { question: 'Total revenue', sql: 'SELECT 1', rowCount: 1 }
    expect(checkResult({ ...base, columns: columns('rev', 'mom'), rows: [[5, null]] })).toBeNull()
    expect(checkResult({ ...base, columns: columns('rev'), rows: [[null]] })?.problem).toBe(
      'The only row is entirely NULL',
    )
  })

  it('flags one row where the question asks for a breakdown', () => {
    const row = { columns: columns('revenue'), rows: [[10]], rowCount: 1 }
    const check = (question: string, sql = 'SELECT sum(revenue) FROM t') =>
      checkResult({ question, sql, ...row })?.problem ?? null
    expect(check('Revenue by region')).toBe(
      'One row came back, but the question asks for a breakdown',
    )
    expect(check('Top 5 products')).not.toBeNull()
    expect(check('Revenue for each month')).not.toBeNull()
    expect(check('Total revenue')).toBeNull()
    expect(check('Which region has the highest revenue?')).toBeNull()
    expect(check('Best region by revenue', 'SELECT … ORDER BY 2 DESC LIMIT 1')).toBeNull()
  })

  it('passes a normal result', () => {
    const finding = checkResult({
      question: 'Revenue by region',
      sql: 'SELECT 1',
      columns: columns('region', 'revenue'),
      rows: [
        ['North', 1],
        ['South', 2],
      ],
      rowCount: 2,
    })
    expect(finding).toBeNull()
  })
})

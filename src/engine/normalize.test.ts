import { describe, expect, it } from 'vitest'
import {
  buildNormalizedSelect,
  normalizeCell,
  normalizeExpression,
  trimStatement,
  toLogicalType,
} from './normalize'

describe('toLogicalType', () => {
  it.each([
    ['BIGINT', 'integer'],
    ['UTINYINT', 'integer'],
    ['HUGEINT', 'number'],
    ['DOUBLE', 'number'],
    ['DECIMAL(18,3)', 'number'],
    ['BOOLEAN', 'boolean'],
    ['DATE', 'date'],
    ['TIMESTAMP', 'timestamp'],
    ['TIMESTAMP_NS', 'timestamp'],
    ['TIMESTAMP WITH TIME ZONE', 'timestamp'],
    ['VARCHAR', 'text'],
    ["ENUM('a', 'b')", 'text'],
    ['UUID', 'text'],
    ['TIME', 'other'],
    ['INTERVAL', 'other'],
    ['INTEGER[]', 'other'],
    ['STRUCT(a INTEGER)', 'other'],
    ['MAP(VARCHAR, INTEGER)', 'other'],
    ['BLOB', 'other'],
  ])('%s → %s', (duckType, expected) => {
    expect(toLogicalType(duckType)).toBe(expected)
  })
})

describe('normalizeExpression', () => {
  it.each([
    ['BIGINT', '"c"'],
    ['DOUBLE', '"c"'],
    ['DECIMAL(18,3)', 'CAST("c" AS DOUBLE)'],
    ['HUGEINT', 'CAST("c" AS DOUBLE)'],
    ['DATE', `strftime("c", '%Y-%m-%d')`],
    ['TIMESTAMP WITH TIME ZONE', `strftime(CAST("c" AS TIMESTAMP), '%Y-%m-%dT%H:%M:%S')`],
    ['VARCHAR', '"c"'],
    ['UUID', 'CAST("c" AS VARCHAR)'],
    ['INTEGER[]', 'CAST("c" AS VARCHAR)'],
  ])('%s', (duckType, expression) => {
    expect(normalizeExpression({ name: 'c', duckType })).toBe(`${expression} AS "c"`)
  })

  it('quotes awkward column names', () => {
    expect(normalizeExpression({ name: 'Total "net"', duckType: 'BIGINT' })).toBe(
      '"Total ""net""" AS "Total ""net"""',
    )
  })
})

describe('buildNormalizedSelect', () => {
  it('wraps the query and applies the row cap', () => {
    const sql = buildNormalizedSelect('SELECT 1 AS a;', [{ name: 'a', duckType: 'INTEGER' }], 10)
    expect(sql).toBe('SELECT "a" AS "a" FROM (\nSELECT 1 AS a\n) AS q\nLIMIT 10')
  })
})

describe('trimStatement', () => {
  it.each([
    ['SELECT 1 ;\n ; \n', 'SELECT 1'],
    ['SELECT 1; -- done', 'SELECT 1'],
    ['SELECT 1 /* trailing */ ;', 'SELECT 1'],
    ['SELECT 1 -- note\nFROM t;', 'SELECT 1 -- note\nFROM t'],
    ["SELECT 'a;b -- not a comment'", "SELECT 'a;b -- not a comment'"],
    ["SELECT 'it''s';", "SELECT 'it''s'"],
    ['SELECT "odd;name" FROM t', 'SELECT "odd;name" FROM t'],
    ['-- only a comment', ''],
  ])('%j → %j', (input, expected) => {
    expect(trimStatement(input)).toBe(expected)
  })
})

describe('normalizeCell', () => {
  it('converts BigInt to number when safe, otherwise to string', () => {
    expect(normalizeCell(42n)).toBe(42)
    expect(normalizeCell(9_007_199_254_740_993n)).toBe('9007199254740993')
  })

  it('passes plain values through and maps undefined to null', () => {
    expect(normalizeCell('x')).toBe('x')
    expect(normalizeCell(1.5)).toBe(1.5)
    expect(normalizeCell(false)).toBe(false)
    expect(normalizeCell(undefined)).toBeNull()
  })
})

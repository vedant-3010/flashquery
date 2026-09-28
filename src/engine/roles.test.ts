import { describe, expect, it } from 'vitest'
import { inferRole, isIdentifierLike, type RoleInput } from './roles'

const column = (
  name: string,
  type: string,
  approxDistinct: number,
  rowCount = 10_000,
): RoleInput => ({
  name,
  type,
  approxDistinct,
  rowCount,
  nullPct: 0,
})

describe('inferRole', () => {
  it.each([
    [column('order_id', 'BIGINT', 10_200), 'id'],
    [column('customerId', 'VARCHAR', 9_800), 'id'],
    [column('customer_id', 'BIGINT', 4_000), 'id'],
    [column('id', 'INTEGER', 40), 'id'],
    [column('product_code', 'VARCHAR', 25), 'category'],
    [column('order_date', 'DATE', 1_400), 'time'],
    [column('created_at', 'TIMESTAMP', 9_000), 'time'],
    [column('year', 'INTEGER', 4), 'time'],
    [column('fiscal_year', 'BIGINT', 6), 'time'],
    [column('country', 'VARCHAR', 19), 'geo'],
    [column('Region', 'VARCHAR', 5), 'geo'],
    [column('latitude', 'DOUBLE', 9_000), 'geo'],
    [column('returned', 'BOOLEAN', 2), 'boolean'],
    [column('channel', 'VARCHAR', 3), 'category'],
    [column('product', 'VARCHAR', 25), 'category'],
    [column('city_name', 'VARCHAR', 400), 'category'],
    [column('customer_name', 'VARCHAR', 8_000), 'text'],
    [column('comment', 'VARCHAR', 900, 1_000), 'text'],
    [column('job_satisfaction', 'BIGINT', 4), 'category'],
    [column('units', 'INTEGER', 20), 'measure'],
    [column('quantity', 'INTEGER', 8), 'measure'],
    [column('revenue', 'DOUBLE', 9_000), 'measure'],
    [column('discount', 'DOUBLE', 31), 'measure'],
    [column('amount', 'DECIMAL(18,2)', 5_000), 'measure'],
    [column('tags', 'VARCHAR[]', 300), 'text'],
  ])('%o → %s', (input, expected) => {
    expect(inferRole(input)).toBe(expected)
  })

  it('treats a low-cardinality *_id column as a category', () => {
    expect(inferRole(column('region_id', 'INTEGER', 5))).toBe('category')
  })
})

describe('isIdentifierLike', () => {
  it.each([
    ['order_id', true],
    ['customerId', true],
    ['year', true],
    ['zip', true],
    ['revenue', false],
    ['units', false],
  ])('%s → %s', (name, expected) => {
    expect(isIdentifierLike(name)).toBe(expected)
  })
})

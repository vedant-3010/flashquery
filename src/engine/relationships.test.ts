// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { profileTable } from './profile'
import { candidatePairs, detectRelationships, relationshipId } from './relationships'
import type { DatasetProfile } from './types'

// F-PROF-07: join keys found from names, types and overlapping values.

let engine: Engine
let datasets: DatasetProfile[]

async function dataset(table: string): Promise<DatasetProfile> {
  const profile = await profileTable(engine, table)
  return { table, columns: profile.columns, rowCount: profile.rowCount } as DatasetProfile
}

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(`CREATE TABLE customers AS
    SELECT i AS id, 'Customer ' || i AS name, ['North', 'South'][1 + i % 2] AS region
    FROM range(1, 201) r(i)`)
  await engine.run(`CREATE TABLE orders AS
    SELECT i AS order_id, 1 + i % 150 AS customer_id, i * 2.5 AS amount
    FROM range(1, 1001) r(i)`)
  await engine.run(`CREATE TABLE products AS
    SELECT i AS product_id, 'P' || i AS title FROM range(5000, 5100) r(i)`)
  datasets = await Promise.all(['customers', 'orders', 'products'].map(dataset))
})

describe('relationship detection (F-PROF-07)', () => {
  it('pairs columns by name: same name, or <table>_id with id', () => {
    const ids = candidatePairs(datasets).map(
      ({ a, ca, b, cb }) => `${a.table}.${ca.name}~${b.table}.${cb.name}`,
    )
    expect(ids).toContain('customers.id~orders.customer_id')
    expect(ids.some((id) => id.includes('amount'))).toBe(false)
  })

  it('keeps joins whose values overlap, pointing from the many side to the unique one', async () => {
    const found = await detectRelationships(engine, datasets)
    expect(found.map(relationshipId)).toEqual(['orders.customer_id->customers.id'])
    expect(found[0]).toMatchObject({ kind: 'many-to-one', overlap: 1 })
  })

  it('drops name matches whose values do not overlap', async () => {
    await engine.run(`CREATE TABLE product_reviews AS
      SELECT i AS product_id, 4 AS stars FROM range(1, 50) r(i)`)
    const reviews = await dataset('product_reviews')
    const found = await detectRelationships(engine, [datasets[2] as DatasetProfile, reviews])
    expect(found).toEqual([])
  })
})

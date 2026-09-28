// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { runQuery } from './query'
import { guardSql } from './sqlGuard'

// F-SEC-01. The guard must reject anything that isn't one SELECT over loaded tables.

let engine: Engine
const tables = ['sales', 'customers']

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run('CREATE TABLE sales AS SELECT range AS id, range * 2 AS amount FROM range(5)')
  await engine.run("CREATE TABLE customers AS SELECT 1 AS id, 'Ada' AS name")
  await engine.run('CREATE TABLE secrets AS SELECT 42 AS pin')
})

afterAll(() => engine.terminate())

const accepts = (sql: string) => expect(guardSql(engine, sql, { tables })).resolves.toBeTruthy()
const rejects = (sql: string, reason: RegExp) =>
  expect(guardSql(engine, sql, { tables })).rejects.toMatchObject({
    code: 'guard_rejected',
    message: expect.stringMatching(reason),
  })

describe('guardSql accepts', () => {
  it.each([
    ['a simple select', 'SELECT id, amount FROM sales'],
    [
      'joins and aggregates',
      'SELECT c.name, sum(s.amount) FROM sales s JOIN customers c USING (id) GROUP BY ALL',
    ],
    [
      'CTEs, including recursive-looking names',
      'WITH totals AS (SELECT sum(amount) AS t FROM sales) SELECT * FROM totals',
    ],
    [
      'nested CTEs',
      'WITH a AS (SELECT * FROM sales), b AS (SELECT * FROM a) SELECT count(*) FROM b',
    ],
    ['allowed table functions', 'SELECT * FROM range(10) r CROSS JOIN generate_series(1, 3) g'],
    ['unnest', 'SELECT unnest([1, 2, 3]) AS x'],
    ['UNION', 'SELECT id FROM sales UNION ALL SELECT id FROM customers'],
    ['subqueries over loaded tables', 'SELECT * FROM sales WHERE id IN (SELECT id FROM customers)'],
    ['case-insensitive and main-qualified names', 'SELECT * FROM MAIN.Sales'],
    ['a trailing semicolon and comment', 'SELECT 1 AS x; -- done'],
    ['VALUES lists', 'SELECT * FROM (VALUES (1), (2)) v(x)'],
    [
      'QUALIFY and window functions',
      'SELECT id, row_number() OVER (ORDER BY amount DESC) AS r FROM sales QUALIFY r <= 2',
    ],
  ])('%s', async (_, sql) => {
    await accepts(sql)
  })

  it('returns the trimmed SQL', async () => {
    await expect(guardSql(engine, 'SELECT 1 AS x;\n\n', { tables })).resolves.toBe('SELECT 1 AS x')
  })
})

describe('guardSql rejects', () => {
  it.each([
    ['INSERT', 'INSERT INTO sales VALUES (9, 9)'],
    ['UPDATE', 'UPDATE sales SET amount = 0'],
    ['DELETE', 'DELETE FROM sales'],
    ['DROP', 'DROP TABLE sales'],
    ['CREATE', 'CREATE TABLE x AS SELECT 1'],
    ['CREATE VIEW', 'CREATE VIEW v AS SELECT * FROM secrets'],
    ['ATTACH', "ATTACH 'https://evil.example/db.duckdb' AS evil"],
    ['COPY', "COPY sales TO 'out.csv'"],
    ['INSTALL', 'INSTALL httpfs'],
    ['LOAD', 'LOAD httpfs'],
    ['PRAGMA', 'PRAGMA table_info(sales)'],
    ['SET', 'SET autoload_known_extensions = true'],
    ['CALL', 'CALL pragma_version()'],
    ['EXPORT DATABASE', "EXPORT DATABASE 'dump'"],
  ])('%s', async (_, sql) => {
    await rejects(sql, /only a single SELECT|could not parse/)
  })

  it.each([
    ['two statements', 'SELECT 1; SELECT 2'],
    ['a SELECT smuggling a DROP', 'SELECT 1; DROP TABLE sales'],
    ['a block comment trick', 'SELECT 1 /* harmless */; DROP TABLE sales'],
  ])('%s', async (_, sql) => {
    await rejects(sql, /more than one statement|only a single SELECT/)
  })

  it.each([
    ['read_csv of a URL', "SELECT * FROM read_csv('https://evil.example/x.csv')"],
    ['read_parquet', "SELECT * FROM read_parquet('local.parquet')"],
    ['read_json_auto', "SELECT * FROM read_json_auto('x.json')"],
    ['glob', "SELECT * FROM glob('*')"],
    ['duckdb_tables()', 'SELECT * FROM duckdb_tables()'],
    ['pragma table functions', "SELECT * FROM pragma_table_info('sales')"],
    ['query()', "SELECT * FROM query('SELECT * FROM secrets')"],
  ])('%s', async (_, sql) => {
    await rejects(sql, /table function/)
  })

  it.each([
    ['an unloaded table', 'SELECT * FROM secrets'],
    ['a table inside a scalar subquery', 'SELECT (SELECT max(pin) FROM secrets) AS p FROM sales'],
    ['a table inside a join', 'SELECT * FROM sales JOIN secrets ON true'],
    ['a table inside a CTE', 'WITH x AS (SELECT * FROM secrets) SELECT * FROM x'],
    ['a file path (replacement scan)', "SELECT * FROM 'data.csv'"],
    ['a URL (replacement scan)', "SELECT * FROM 'https://evil.example/x.parquet'"],
    ['a system schema', 'SELECT * FROM information_schema.tables'],
    ['another catalog', 'SELECT * FROM system.main.duckdb_settings'],
  ])('%s', async (_, sql) => {
    await rejects(sql, /isn't a loaded table/)
  })

  it.each([
    ['getenv()', "SELECT getenv('HOME')"],
    ['read_text()', "SELECT * FROM sales WHERE id = (SELECT count(*) FROM read_text('x'))"],
  ])('blocked function: %s', async (_, sql) => {
    await rejects(sql, /isn't allowed/)
  })

  it('rejects SHOW/DESCRIBE/SUMMARIZE', async () => {
    await rejects('SELECT * FROM (DESCRIBE secrets)', /not allowed|isn't a loaded table/)
  })

  it('rejects empty SQL', async () => {
    await rejects('-- nothing here', /empty/)
  })

  it('never executes what it checks', async () => {
    await guardSql(engine, 'DROP TABLE sales', { tables }).catch(() => undefined)
    await guardSql(engine, 'SELECT 1; DROP TABLE sales', { tables }).catch(() => undefined)
    expect((await runQuery(engine, 'SELECT count(*) FROM sales')).rows).toEqual([[5]])
  })
})

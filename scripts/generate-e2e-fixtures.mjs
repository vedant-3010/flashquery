// Regenerates the binary e2e fixtures in e2e/fixtures/ (text fixtures are built inside the specs).
// Usage: node scripts/generate-e2e-fixtures.mjs  (needs network once: DuckDB fetches its parquet extension)
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { utils, write } from 'xlsx'

const require = createRequire(import.meta.url)
const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs')
const dist = (file) =>
  fileURLToPath(new URL(`../node_modules/@duckdb/duckdb-wasm/dist/${file}`, import.meta.url))
const out = (file) => fileURLToPath(new URL(`../e2e/fixtures/${file}`, import.meta.url))
mkdirSync(out(''), { recursive: true })

// orders.parquet: 500 rows with a nested column.
const db = await duckdb.createDuckDB(
  {
    mvp: { mainModule: dist('duckdb-mvp.wasm'), mainWorker: dist('duckdb-node-mvp.worker.cjs') },
    eh: { mainModule: dist('duckdb-eh.wasm'), mainWorker: dist('duckdb-node-eh.worker.cjs') },
  },
  new duckdb.VoidLogger(),
  duckdb.NODE_RUNTIME,
)
await db.instantiate()
db.open({})
const conn = db.connect()
conn.query('INSTALL parquet')
conn.query('LOAD parquet')
// DuckDB's Node runtime writes COPY output to the real disk: use a temp dir.
const scratch = mkdtempSync(join(tmpdir(), 'askdata-fixtures-'))
const parquet = join(scratch, 'orders.parquet')
conn.query(`COPY (
  SELECT range + 1 AS order_id,
         DATE '2025-01-01' + CAST(range % 90 AS INTEGER) AS order_date,
         ['North', 'South', 'East', 'West'][1 + range % 4] AS region,
         round(10 + (range * 37 % 500) / 3.0, 2) AS amount,
         {'sku': 'SKU-' || (range % 25), 'qty': 1 + range % 5} AS item
  FROM range(500)
) TO '${parquet}' (FORMAT parquet)`)
writeFileSync(out('orders.parquet'), readFileSync(parquet))
rmSync(scratch, { recursive: true, force: true })
conn.close()

// workbook.xlsx: two sheets with data and an empty one (the picker should list only two).
const q1 = utils.aoa_to_sheet(
  [
    ['month', 'region', 'revenue'],
    [new Date(2025, 0, 1), 'North', 1200.5],
    [new Date(2025, 1, 1), 'North', 1340],
    [new Date(2025, 2, 1), 'South', 980.25],
  ],
  { cellDates: true },
)
const targets = utils.aoa_to_sheet([
  ['region', 'target'],
  ['North', 4000],
  ['South', 3500],
])
const book = utils.book_new()
utils.book_append_sheet(book, q1, 'Q1 Sales')
utils.book_append_sheet(book, targets, 'Targets')
utils.book_append_sheet(book, utils.aoa_to_sheet([]), 'Notes')
writeFileSync(out('workbook.xlsx'), write(book, { type: 'buffer', bookType: 'xlsx' }))

console.log('wrote e2e/fixtures/orders.parquet and e2e/fixtures/workbook.xlsx')

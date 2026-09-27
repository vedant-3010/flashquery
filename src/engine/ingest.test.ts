// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { ensureExtension } from './extensions'
import { detectFormat, ingestCsvBytes, ingestFile, sizeWarning } from './ingest'
import { runQuery } from './query'

let engine: Engine

const csvFile = (name: string, text: string) => new File([text], name, { type: 'text/csv' })
const rows = async (sql: string) => (await runQuery(engine, sql)).rows

// DuckDB's Node runtime writes COPY output to the real disk, so fixtures go to a temp dir.
const scratch = mkdtempSync(join(tmpdir(), 'askdata-ingest-'))

beforeAll(async () => {
  engine = await createTestEngine()
})

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('detectFormat', () => {
  it.each([
    ['sales.csv', 'csv'],
    ['sales.TSV', 'csv'],
    ['notes.txt', 'csv'],
    ['book.xlsx', 'excel'],
    ['old.xls', 'excel'],
    ['data.parquet', 'parquet'],
    ['events.jsonl', 'json'],
    ['events.ndjson', 'json'],
    ['report.pdf', null],
    ['no-extension', null],
  ])('%s → %s', (name, format) => {
    expect(detectFormat(name)).toBe(format)
  })
})

describe('sizeWarning', () => {
  it('warns above 500 MB and suggests Parquet above 1 GB', () => {
    expect(sizeWarning(100e6, 'csv')).toBeNull()
    expect(sizeWarning(600e6, 'csv')).toMatch(/500 MB/)
    expect(sizeWarning(1.2e9, 'csv')).toMatch(/Parquet/)
    expect(sizeWarning(1.2e9, 'parquet')).toMatch(/500 MB/)
  })
})

describe('CSV ingest', () => {
  it('creates a typed table and reports the sniffed dialect', async () => {
    const result = await ingestFile(
      engine,
      'semicolons',
      csvFile('semi.csv', 'id;name;amount;day\n1;x;1.5;2025-01-02\n2;"y; z";2.5;2025-01-03\n'),
      'csv',
    )
    expect(result).toEqual({ csv: { delimiter: ';', hasHeader: true }, skippedRows: 0 })
    expect(await rows(`SELECT column_name, column_type FROM (DESCRIBE semicolons)`)).toEqual([
      ['id', 'BIGINT'],
      ['name', 'VARCHAR'],
      ['amount', 'DOUBLE'],
      ['day', 'DATE'],
    ])
    expect(await rows('SELECT name FROM semicolons ORDER BY id')).toEqual([['x'], ['y; z']])
  })

  it('reads TSV', async () => {
    const result = await ingestFile(engine, 'tabbed', csvFile('t.tsv', 'a\tb\n1\t2\n'), 'csv')
    expect(result.csv?.delimiter).toBe('\t')
    expect(await rows('SELECT a + b FROM tabbed')).toEqual([[3]])
  })

  it('fails with the line number, then skips bad rows on request', async () => {
    const text = `id,amount\n${Array.from({ length: 30_000 }, (_, i) => `${i},${i}.5`).join('\n')}\n99999,oops\n`
    await expect(ingestFile(engine, 'bad', csvFile('bad.csv', text), 'csv')).rejects.toMatchObject({
      code: 'csv_parse',
      message: expect.stringContaining('Row 30,002'),
      detail: expect.stringContaining('Original Line: 99999,oops'),
    })
    // A failed CREATE TABLE leaves nothing behind.
    expect(await rows(`SELECT count(*) FROM duckdb_tables() WHERE table_name = 'bad'`)).toEqual([
      [0],
    ])

    const result = await ingestFile(engine, 'bad', csvFile('bad.csv', text), 'csv', {
      ignoreErrors: true,
    })
    expect(result.skippedRows).toBe(1)
    expect(await rows('SELECT count(*) FROM bad')).toEqual([[30_000]])
    expect(
      await rows(`SELECT count(*) FROM duckdb_tables() WHERE table_name LIKE 'rejects_%'`),
    ).toEqual([[0]])
  })

  it('ingests CSV bytes (Excel sheets, bundled samples)', async () => {
    const bytes = new TextEncoder().encode('x,y\n1,a\n2,b\n')
    await ingestCsvBytes(engine, 'from_bytes', bytes)
    expect(await rows('SELECT count(*) FROM from_bytes')).toEqual([[2]])
  })

  it('does not let a file name reach SQL', async () => {
    await ingestFile(engine, 'quoted', csvFile(`it's "odd".csv`, 'a\n1\n'), 'csv')
    expect(await rows('SELECT a FROM quoted')).toEqual([[1]])
  })
})

describe('JSON ingest', () => {
  it('stores nested fields as JSON text (F-DATA-04)', async () => {
    const json = JSON.stringify([
      { id: 1, name: 'a', tags: ['x', 'y'], meta: { score: 3, ok: true } },
      { id: 2, name: 'b', tags: [], meta: { score: 5, ok: false } },
    ])
    await ingestFile(engine, 'nested', new File([json], 'nested.json'), 'json')
    expect(await rows(`SELECT column_name, column_type FROM (DESCRIBE nested)`)).toEqual([
      ['id', 'BIGINT'],
      ['name', 'VARCHAR'],
      ['tags', 'VARCHAR'],
      ['meta', 'VARCHAR'],
    ])
    expect(await rows('SELECT tags, meta FROM nested ORDER BY id LIMIT 1')).toEqual([
      ['["x","y"]', '{"score":3,"ok":true}'],
    ])
  })

  it('reads newline-delimited JSON', async () => {
    const jsonl = '{"event":"view","ms":12}\n{"event":"click","ms":40}\n'
    await ingestFile(engine, 'events', new File([jsonl], 'events.jsonl'), 'json')
    expect(await rows('SELECT sum(ms) FROM events')).toEqual([[52]])
  })
})

describe('Parquet ingest', () => {
  it('creates a table from a Parquet file', async () => {
    // Autoload is off (F-SEC-02), so even COPY needs the extension loaded explicitly.
    await ensureExtension(engine, 'parquet')
    const path = join(scratch, 'fixture.parquet')
    await engine.run(
      `COPY (SELECT range AS id, range * 1.5 AS amount FROM range(5)) TO '${path}' (FORMAT parquet)`,
    )
    const bytes = await engine.readFile(path)
    await ingestFile(engine, 'from_parquet', new File([bytes.slice()], 'x.parquet'), 'parquet')
    expect(await rows('SELECT count(*), sum(amount) FROM from_parquet')).toEqual([[5, 15]])
  })
})

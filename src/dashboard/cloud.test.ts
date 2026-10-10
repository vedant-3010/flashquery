import { describe, expect, it } from 'vitest'
import {
  describeUpload,
  largestTiles,
  linkIsLive,
  MAX_SHARED_BYTES,
  normalizeEmail,
  toSharedDoc,
} from './cloud'
import type { Dashboard, DashboardTile } from './schema'

// F-SHARE-01/02: what a shared dashboard uploads, and what the consent dialog says about it.

const tile = (id: string, rows: number, overrides: Partial<DashboardTile> = {}): DashboardTile => ({
  id,
  type: 'chart',
  title: `Tile ${id}`,
  sql: 'SELECT region, sum(revenue) AS revenue FROM global_sales GROUP BY ALL',
  chartSpec: null,
  text: null,
  layout: { x: 0, y: 0, w: 6, h: 4 },
  datasetRefs: [
    {
      table: 'global_sales',
      schemaHash: 'h',
      label: 'Q3 sales',
      fileName: 'q3-sales.csv',
      sample: false,
    },
  ],
  snapshot: {
    columns: [
      { name: 'region', duckType: 'VARCHAR', logicalType: 'text' },
      { name: 'revenue', duckType: 'DOUBLE', logicalType: 'number' },
    ],
    rows: Array.from({ length: rows }, (_, i) => [`R${i}`, i * 10]),
    rowCount: rows,
    sampling: 'none',
    at: 1,
    filtered: false,
  },
  question: 'Revenue by region',
  edited: false,
  createdAt: 1,
  ...overrides,
})

const dashboard = (tiles: DashboardTile[]): Dashboard => ({
  id: 'dash_1',
  name: 'Q3 review',
  tiles,
  filters: [{ kind: 'values', table: 'global_sales', column: 'region', values: ['APAC'] }],
  createdAt: 1,
  updatedAt: 2,
  cloud: { id: 'cloud-1', version: 3, savedAt: 2 },
})

describe('what sharing uploads (D103)', () => {
  it('keeps titles, SQL, charts and results; drops source files, filters and the local link', () => {
    const doc = toSharedDoc(dashboard([tile('a', 3)]))
    expect(doc.tiles[0]).toMatchObject({ title: 'Tile a', sql: expect.stringContaining('SELECT') })
    expect(doc.tiles[0]?.snapshot?.rows).toHaveLength(3)
    expect(doc.tiles[0]?.datasetRefs).toEqual([])
    expect(doc.filters).toEqual([])
    expect(doc).not.toHaveProperty('cloud')
    expect(JSON.stringify(doc)).not.toContain('q3-sales.csv')
  })

  it('lists every tile with its rows and columns for the consent dialog', () => {
    const summary = describeUpload(
      dashboard([
        tile('a', 5),
        tile('b', 0, { type: 'text', text: '# Notes', snapshot: null, sql: null }),
      ]),
    )
    expect(summary.tiles).toEqual([
      {
        id: 'a',
        title: 'Tile a',
        type: 'chart',
        rows: 5,
        columns: ['region', 'revenue'],
        sql: true,
      },
      { id: 'b', title: 'Tile b', type: 'text', rows: 0, columns: [], sql: false },
    ])
    expect(summary.rows).toBe(5)
    expect(summary.bytes).toBeGreaterThan(0)
    expect(summary.tooBig).toBe(false)
  })

  it('says when it is too big, and which tiles weigh most', () => {
    const big = dashboard([tile('small', 10), tile('huge', 5_000, { title: 'Huge' })])
    // Make the huge tile's rows long enough to pass the cap.
    const huge = big.tiles[1]
    if (huge?.snapshot)
      huge.snapshot.rows = huge.snapshot.rows.map((row) => [
        `${row[0]}${'x'.repeat(900)}`,
        row[1] ?? null,
      ])
    const summary = describeUpload(big)
    expect(summary.bytes).toBeGreaterThan(MAX_SHARED_BYTES)
    expect(summary.tooBig).toBe(true)
    expect(largestTiles(big, 1)[0]?.title).toBe('Huge')
  })
})

describe('links and invites', () => {
  it('treats revoked and expired links as no longer shared', () => {
    const now = Date.parse('2026-10-11T12:00:00Z')
    const link = { slug: 's', expiresAt: null, revokedAt: null, createdAt: '2026-10-01T00:00:00Z' }
    expect(linkIsLive(link, now)).toBe(true)
    expect(linkIsLive({ ...link, revokedAt: '2026-10-10T00:00:00Z' }, now)).toBe(false)
    expect(linkIsLive({ ...link, expiresAt: '2026-10-11T11:00:00Z' }, now)).toBe(false)
    expect(linkIsLive({ ...link, expiresAt: '2026-10-12T00:00:00Z' }, now)).toBe(true)
  })

  it('normalizes invite addresses', () => {
    expect(normalizeEmail('  Meera@Example.COM ')).toBe('meera@example.com')
    expect(normalizeEmail('not an email')).toBeNull()
    expect(normalizeEmail('a@b')).toBeNull()
  })
})

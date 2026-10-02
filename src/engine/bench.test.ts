// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import { benchMarkdown, dropBenchTables, percentile, runEngineBench } from './bench'

describe('benchmark (F-PERF-04)', () => {
  it('times every engine step and cleans up', async () => {
    const engine = await createTestEngine()
    const steps: string[] = []
    const results = await runEngineBench(engine, { rows: 5_000, onStep: (s) => steps.push(s) })
    expect(results.map((r) => r.id)).toEqual([
      'generate',
      'profile',
      'export',
      'ingest',
      'query-p50',
      'query-p95',
    ])
    expect(results.every((r) => r.value !== null && r.value >= 0)).toBe(true)
    // Budgets are for 1M rows only.
    expect(results.every((r) => r.budget === null)).toBe(true)
    expect(steps).toHaveLength(4)
    await dropBenchTables(engine)
    const left = (
      await engine.run("SELECT count(*) AS n FROM duckdb_tables() WHERE table_name LIKE 'bench%'")
    ).toArray()
    expect(Number(left[0]?.n)).toBe(0)
  }, 60_000)

  it('computes percentiles and renders Markdown', () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3)
    expect(percentile([5, 1, 4, 2, 3], 95)).toBe(5)
    const markdown = benchMarkdown(
      [
        { id: 'query-p95', label: 'Aggregation query p95', value: 120, budget: 500, detail: null },
        { id: 'generate', label: 'Generate', value: 6200, budget: 5000, detail: null },
        { id: 'memory-js', label: 'JS heap', value: 80, budget: null, detail: null },
      ],
      'Chrome · 1M rows',
    )
    expect(markdown).toContain('| Aggregation query p95 | 120 ms | ≤ 500 ms | ✅ |')
    expect(markdown).toContain('| Generate | 6.20 s | ≤ 5.00 s | ❌ |')
    expect(markdown).toContain('| JS heap | 80 MB | — |  |')
  })
})

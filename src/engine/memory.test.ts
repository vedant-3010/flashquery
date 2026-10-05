// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import { engineMemory } from './memory'
import { createGlobalSalesSql } from './samples'

describe('engineMemory (F-PERF-05)', () => {
  it('reports more memory after loading a table, largest consumers first', async () => {
    const engine = await createTestEngine()
    const before = await engineMemory(engine)
    await engine.run(createGlobalSalesSql(50_000))
    const after = await engineMemory(engine)
    expect(after.totalBytes).toBeGreaterThan(before.totalBytes)
    expect(after.top.length).toBeGreaterThan(0)
    expect(after.top.length).toBeLessThanOrEqual(4)
    const sizes = after.top.map((entry) => entry.bytes)
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes)
    expect(after.top.map((entry) => entry.tag)).toContain('IN_MEMORY_TABLE')
  })
})

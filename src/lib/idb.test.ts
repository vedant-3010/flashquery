import { describe, expect, it } from 'vitest'
import { z } from '@/lib/zod'
import { loadRecord, memoryStore, saveRecord, type CorruptRecord, type RecordSpec } from './idb'

const spec: RecordSpec<{ name: string; count: number }> = {
  key: 'things',
  version: 2,
  schema: z.object({ name: z.string(), count: z.number() }),
  migrations: {
    // v1 stored { title }
    1: (data) => ({ name: (data as { title: string }).title, count: 0 }),
  },
  fallback: () => ({ name: 'default', count: 0 }),
}

describe('persistence (F-EXP-02)', () => {
  it('round-trips a record in a versioned envelope', async () => {
    const store = memoryStore()
    await saveRecord(spec, { name: 'a', count: 2 }, { store })
    expect(await store.get('things')).toMatchObject({ version: 2, data: { name: 'a', count: 2 } })
    expect(await loadRecord(spec, { store })).toEqual({ name: 'a', count: 2 })
  })

  it('returns the fallback when nothing is saved', async () => {
    expect(await loadRecord(spec, { store: memoryStore() })).toEqual({ name: 'default', count: 0 })
  })

  it('migrates older versions forward', async () => {
    const store = memoryStore({ things: { version: 1, savedAt: 0, data: { title: 'old' } } })
    expect(await loadRecord(spec, { store })).toEqual({ name: 'old', count: 0 })
  })

  it.each([
    ['not an envelope', 'garbage', /Not a saved/],
    ['a newer version', { version: 9, savedAt: 0, data: {} }, /newer version/],
    ['invalid data', { version: 2, savedAt: 0, data: { name: 5 } }, /Invalid data/],
    ['a missing migration', { version: 0, savedAt: 0, data: {} }, /No migration/],
  ])('resets %s after reporting it for a backup', async (_, raw, reason) => {
    const store = memoryStore({ things: raw })
    const corrupt: CorruptRecord[] = []
    const value = await loadRecord(spec, { store, onCorrupt: (record) => corrupt.push(record) })
    expect(value).toEqual({ name: 'default', count: 0 })
    expect(corrupt).toEqual([{ key: 'things', reason: expect.stringMatching(reason), raw }])
    expect(await store.get('things')).toBeUndefined()
  })

  it('refuses to save invalid data', async () => {
    await expect(
      saveRecord(spec, { name: 1 } as unknown as { name: string; count: number }, {
        store: memoryStore(),
      }),
    ).rejects.toThrow()
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import type { ColumnProfile, DatasetProfile } from '@/engine/types'
import { notesOf, useNotesStore, withNotes } from './notes'

// F-PROF-05: notes are saved by schemaHash and applied to matching datasets.

const column = (name: string): ColumnProfile => ({
  name,
  type: 'DOUBLE',
  role: 'measure',
  nullPct: 0,
  approxDistinct: 1,
  min: null,
  max: null,
  mean: null,
  quartiles: null,
  topValues: [],
  description: null,
  unit: null,
})

const dataset = {
  notes: null,
  columns: [column('revenue'), column('cost')],
} as unknown as DatasetProfile

beforeEach(() => useNotesStore.setState({ bySchema: {} }))

describe('notes', () => {
  it('cleans text, drops empty columns and applies the rest', () => {
    const saved = useNotesStore.getState().save('h1', {
      notes: '  Fiscal year starts in April. ',
      columns: {
        revenue: { description: ' Net of returns ', unit: 'INR' },
        cost: { description: '  ', unit: '' },
        gone: { description: 'old column', unit: null },
      },
    })
    expect(saved).toEqual({
      notes: 'Fiscal year starts in April.',
      columns: {
        revenue: { description: 'Net of returns', unit: 'INR' },
        gone: { description: 'old column', unit: null },
      },
    })
    const applied = withNotes(dataset, saved)
    expect(applied.notes).toBe('Fiscal year starts in April.')
    expect(applied.columns.map((c) => [c.name, c.description, c.unit])).toEqual([
      ['revenue', 'Net of returns', 'INR'],
      ['cost', null, null],
    ])
    expect(notesOf(applied).columns).toEqual({
      revenue: { description: 'Net of returns', unit: 'INR' },
    })
  })

  it('forgets a dataset whose notes are cleared', () => {
    useNotesStore.getState().save('h1', { notes: 'x', columns: {} })
    useNotesStore.getState().save('h1', { notes: '', columns: {} })
    expect(useNotesStore.getState().bySchema).toEqual({})
  })
})

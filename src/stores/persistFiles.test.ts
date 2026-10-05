import { describe, expect, it } from 'vitest'
import { SAMPLES } from '@/engine/samples'
import { describeInput, toDatasetInput, type PersistedDataset } from './persistFiles'

// F-DATA-12: what is kept for each kind of input, and how it loads again.

const entry = (described: ReturnType<typeof describeInput>): PersistedDataset => ({
  id: 'ds_1',
  table: 't',
  label: 'T',
  fileName: described.fileName,
  stored: described.blob !== null,
  input: described.input,
  ignoreErrors: false,
  overrides: [],
  savedAt: 0,
})

describe('kept datasets (F-DATA-12)', () => {
  it('keeps a CSV with its import options and loads it under its own name', async () => {
    const file = new File(['a;b\n1;2\n'], 'sales.csv', { type: 'text/csv' })
    const csv = { delimiter: ';', header: true, skipRows: 0, dateFormat: null, allText: false }
    const described = describeInput({ kind: 'file', file, format: 'csv', csv })
    expect(described).toMatchObject({ fileName: 'sales.csv', input: { kind: 'file', csv } })
    const stored = new File([await file.text()], 'ds_1')
    const input = await toDatasetInput(entry(described), stored)
    expect(input?.kind === 'file' && input.file.name).toBe('sales.csv')
    expect(input?.kind === 'file' && (await input.file.text())).toBe('a;b\n1;2\n')
    expect(input?.kind === 'file' && input.csv).toEqual(csv)
  })

  it('keeps pasted text and a workbook sheet; regenerates samples without storing bytes', async () => {
    const pasted = describeInput({ kind: 'paste', text: 'x\ty\n1\t2\n' })
    const back = await toDatasetInput(
      entry(pasted),
      new File([await (pasted.blob as Blob).text()], 'ds_1'),
    )
    expect(back).toEqual({ kind: 'paste', text: 'x\ty\n1\t2\n' })

    const sheet = describeInput({ kind: 'excel', file: new File(['x'], 'book.xlsx'), sheet: 'Q1' })
    expect(sheet.input).toEqual({ kind: 'excel', sheet: 'Q1' })

    const sample = SAMPLES[0]
    if (!sample) throw new Error('no samples')
    const kept = describeInput({ kind: 'sample', sample })
    expect(kept.blob).toBeNull()
    expect(await toDatasetInput(entry(kept), null)).toEqual({ kind: 'sample', sample })
  })

  it('gives up on a kept file whose bytes are gone', async () => {
    const described = describeInput({ kind: 'file', file: new File(['1'], 'a.csv'), format: 'csv' })
    expect(await toDatasetInput(entry(described), null)).toBeNull()
  })
})

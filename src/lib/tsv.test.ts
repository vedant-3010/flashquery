import { describe, expect, it } from 'vitest'
import { looksLikeTable, toTsv, tsvShape } from './tsv'

describe('toTsv', () => {
  it('writes a header and rows, blanking nulls', () => {
    expect(
      toTsv(
        ['a', 'b'],
        [
          [1, 'x'],
          [null, true],
        ],
      ),
    ).toBe('a\tb\n1\tx\n\ttrue\n')
  })

  it('quotes values with tabs, newlines or quotes', () => {
    expect(toTsv(['note'], [['one\ttwo'], ['line\nbreak'], ['say "hi"']])).toBe(
      'note\n"one\ttwo"\n"line\nbreak"\n"say ""hi"""\n',
    )
  })
})

describe('pasted tables (F-DATA-10)', () => {
  it('recognizes spreadsheet cells and counts them', () => {
    const text = 'city\tsales\r\nPune\t12\r\nGoa\t8\r\n'
    expect(looksLikeTable(text)).toBe(true)
    expect(looksLikeTable('just one line\twith a tab')).toBe(false)
    expect(looksLikeTable('two\nlines without tabs')).toBe(false)
    expect(tsvShape(text)).toEqual({ rows: 2, columns: 2 })
  })
})

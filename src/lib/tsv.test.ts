import { describe, expect, it } from 'vitest'
import { toTsv } from './tsv'

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

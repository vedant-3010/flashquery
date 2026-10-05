import { describe, expect, it } from 'vitest'
import { searchCommands } from './commandSearch'

const items = [
  { label: 'Open settings', group: 'Settings' },
  { label: 'Preview Global Sales · 10k rows', group: 'Datasets', keywords: 'global_sales table' },
  { label: 'Which region grew fastest?', group: 'Questions' },
  { label: 'Privacy mode: Strict', group: 'Settings' },
  { label: 'Go to SQL', group: 'Go to' },
]

describe('command search (F-SHELL-07)', () => {
  it('lists everything for an empty query', () => {
    expect(searchCommands(items, '  ')).toHaveLength(items.length)
  })

  it('needs every word, ranks label starts first, and searches keywords', () => {
    expect(searchCommands(items, 'region fast').map((i) => i.label)).toEqual([
      'Which region grew fastest?',
    ])
    expect(searchCommands(items, 'sql')[0]?.label).toBe('Go to SQL')
    expect(searchCommands(items, 'global_sales').map((i) => i.group)).toEqual(['Datasets'])
    expect(searchCommands(items, 'pr').map((i) => i.label)).toEqual([
      'Preview Global Sales · 10k rows',
      'Privacy mode: Strict',
    ])
    expect(searchCommands(items, 'nothing like this')).toEqual([])
  })
})

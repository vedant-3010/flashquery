import { describe, expect, it } from 'vitest'
import { moveTile, placeTile, planLayout, sizePreset } from './layout'

describe('placeTile (F-DASH-02 auto-place)', () => {
  it('fills the first free spot, left to right, then below', () => {
    expect(placeTile([], { w: 6, h: 4 })).toEqual({ x: 0, y: 0, w: 6, h: 4 })
    const one = [{ x: 0, y: 0, w: 6, h: 4 }]
    expect(placeTile(one, { w: 6, h: 4 })).toEqual({ x: 6, y: 0, w: 6, h: 4 })
    const two = [...one, { x: 6, y: 0, w: 6, h: 4 }]
    expect(placeTile(two, { w: 3, h: 2 })).toEqual({ x: 0, y: 4, w: 3, h: 2 })
  })

  it('uses gaps between tiles', () => {
    const taken = [
      { x: 0, y: 0, w: 3, h: 2 },
      { x: 6, y: 0, w: 6, h: 4 },
    ]
    expect(placeTile(taken, { w: 3, h: 2 })).toEqual({ x: 3, y: 0, w: 3, h: 2 })
  })
})

describe('planLayout (F-DASH-09)', () => {
  it('puts KPIs in a row, then trends, then breakdowns in pairs', () => {
    const layout = planLayout([
      { size: 'half', type: 'chart' },
      { size: 'kpi', type: 'kpi' },
      { size: 'full', type: 'chart' },
      { size: 'kpi', type: 'kpi' },
      { size: 'kpi', type: 'kpi' },
      { size: 'half', type: 'chart' },
    ])
    expect(layout).toEqual([
      { x: 0, y: 6, w: 6, h: 4 },
      { x: 0, y: 0, w: 4, h: 2 },
      { x: 0, y: 2, w: 12, h: 4 },
      { x: 4, y: 0, w: 4, h: 2 },
      { x: 8, y: 0, w: 4, h: 2 },
      { x: 6, y: 6, w: 6, h: 4 },
    ])
  })

  it('wraps more than four KPIs', () => {
    const layout = planLayout(
      Array.from({ length: 5 }, () => ({ size: 'kpi' as const, type: 'kpi' as const })),
    )
    expect(layout.map((l) => [l.x, l.y])).toEqual([
      [0, 0],
      [3, 0],
      [6, 0],
      [9, 0],
      [0, 2],
    ])
  })
})

describe('sizes and moves (keyboard alternatives)', () => {
  it('offers small, medium and large sizes', () => {
    expect(sizePreset('chart', 'small')).toEqual({ w: 3, h: 3 })
    expect(sizePreset('chart', 'medium')).toEqual({ w: 6, h: 4 })
    expect(sizePreset('chart', 'large')).toEqual({ w: 12, h: 5 })
    expect(sizePreset('kpi', 'large')).toEqual({ w: 12, h: 2 })
  })

  it('swaps a tile with its neighbour in reading order', () => {
    const layouts = new Map([
      ['a', { x: 0, y: 0, w: 6, h: 4 }],
      ['b', { x: 6, y: 0, w: 6, h: 4 }],
      ['c', { x: 0, y: 4, w: 6, h: 4 }],
    ])
    const moved = moveTile(layouts, 'c', 'earlier')
    expect(moved.get('c')).toMatchObject({ x: 6, y: 0 })
    expect(moved.get('b')).toMatchObject({ x: 0, y: 4 })
    expect(moveTile(layouts, 'a', 'earlier')).toEqual(layouts)
  })
})

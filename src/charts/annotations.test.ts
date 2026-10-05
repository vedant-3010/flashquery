import { describe, expect, it } from 'vitest'
import type { CellValue, ColumnMeta } from '@/engine/types'
import { describeAnnotations, seriesMarks } from './annotations'
import { selectChart } from './select'
import { prepare } from './shape'
import type { ChartSpec } from './spec'
import { LIGHT_THEME } from './theme'
import { describeChart, toOption } from './toOption'

// F-VIZ-08: max/min markers, average and target lines, with labels in words.

const ctx = { theme: LIGHT_THEME, locale: 'en-US', animation: false }
const columns: ColumnMeta[] = [
  { name: 'region', duckType: 'VARCHAR', logicalType: 'text' },
  { name: 'revenue', duckType: 'DOUBLE', logicalType: 'number' },
]
const rows: CellValue[][] = [
  ['APAC', 300],
  ['Europe', 200],
  ['LATAM', 100],
]
const bar = selectChart({ columns, rows, rowCount: rows.length })
const annotated = (spec: ChartSpec, annotations: ChartSpec['annotations']): ChartSpec => ({
  ...spec,
  annotations,
})
const all = { extremes: true, average: true, target: 250 }

describe('chart annotations (F-VIZ-08)', () => {
  it('adds nothing without annotations or for charts without a value axis', () => {
    expect(seriesMarks(bar, ctx, { horizontal: false, first: true })).toEqual({})
    expect(
      seriesMarks(annotated({ ...bar, type: 'donut' }, all), ctx, {
        horizontal: false,
        first: true,
      }),
    ).toEqual({})
  })

  it('marks extremes, the average and a target on the first series', () => {
    const marks = seriesMarks(annotated(bar, all), ctx, { horizontal: false, first: true })
    expect(marks.markPoint?.data).toEqual([
      { type: 'max', name: 'Highest' },
      { type: 'min', name: 'Lowest' },
    ])
    expect(marks.markLine?.data).toEqual([
      expect.objectContaining({ type: 'average', name: 'Average' }),
      expect.objectContaining({ yAxis: 250, name: 'Target' }),
    ])
    const other = seriesMarks(annotated(bar, all), ctx, { horizontal: false, first: false })
    expect(other.markLine?.data).toHaveLength(1)
    const horizontal = seriesMarks(
      annotated({ ...bar, type: 'hbar' }, { ...all, average: false }),
      ctx,
      {
        horizontal: true,
        first: true,
      },
    )
    expect(horizontal.markLine?.data).toEqual([expect.objectContaining({ xAxis: 250 })])
  })

  it('keeps only the target line on stacked charts', () => {
    const stacked = annotated({ ...bar, type: 'stacked_bar', stacked: true }, all)
    const marks = seriesMarks(stacked, ctx, { horizontal: false, first: true })
    expect(marks.markPoint).toBeUndefined()
    expect(marks.markLine?.data).toEqual([expect.objectContaining({ name: 'Target' })])
  })

  it('puts the marks in the option and says so in the text alternative', () => {
    const spec = annotated(bar, all)
    const prepared = prepare(spec, { columns, rows, rowCount: rows.length, sampling: 'none' })
    const option = toOption(spec, prepared, ctx)
    const series = (option?.series as { markLine?: unknown }[] | undefined)?.[0]
    expect(series?.markLine).toBeDefined()
    expect(describeChart(spec, prepared, 'en-US')).toContain(
      'With highest and lowest values marked, average line at 200, target line at 250.',
    )
    expect(describeAnnotations(bar, [1, 2], 'en-US')).toBe('')
  })

  it('stretches the value axis so a target above the data stays visible', () => {
    const spec = annotated(bar, { extremes: false, average: false, target: 600 })
    const prepared = prepare(spec, { columns, rows, rowCount: rows.length, sampling: 'none' })
    const option = toOption(spec, prepared, ctx) as { yAxis?: { max?: number } }
    expect(option.yAxis?.max).toBe(700)
    const inside = annotated(bar, { extremes: false, average: false, target: 250 })
    const plain = toOption(
      inside,
      prepare(inside, { columns, rows, rowCount: rows.length, sampling: 'none' }),
      ctx,
    ) as {
      yAxis?: { max?: number }
    }
    expect(plain.yAxis?.max).toBeUndefined()
  })
})

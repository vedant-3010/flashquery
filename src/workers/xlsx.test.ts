// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { utils, write } from 'xlsx'
import { xlsxApi } from './xlsx'

function workbookBuffer(): ArrayBuffer {
  // SheetJS writes JS Dates as local wall-clock time (like a date typed into Excel) and reads them
  // back as UTC-based Dates, so the fixture uses local constructors.
  const sales = utils.aoa_to_sheet(
    [
      ['order_date', 'amount', 'note', 'ok', 'at'],
      [new Date(2025, 2, 1), 1234.5, 'a, b', true, new Date(2025, 2, 1, 14, 5)],
      [new Date(2025, 11, 31), -2, 'x', false, null],
    ],
    { cellDates: true },
  )
  // Display formats must not leak into the CSV.
  sales['A2'] = { ...sales['A2'], z: 'd-mmm-yy' }
  sales['B2'] = { ...sales['B2'], z: '$#,##0.00' }
  const book = utils.book_new()
  utils.book_append_sheet(book, sales, 'Q1 2025')
  utils.book_append_sheet(book, utils.aoa_to_sheet([]), 'Empty')
  return write(book, { type: 'array', bookType: 'xlsx' })
}

describe('xlsxApi', () => {
  it('lists sheets with row counts', () => {
    const { id, sheets } = xlsxApi.open(workbookBuffer())
    expect(sheets).toEqual([
      { name: 'Q1 2025', rows: 3 },
      { name: 'Empty', rows: 0 },
    ])
    xlsxApi.close(id)
  })

  it('converts a sheet to CSV with raw numbers and ISO dates', () => {
    const { id } = xlsxApi.open(workbookBuffer())
    const csv = new TextDecoder().decode(xlsxApi.toCsv(id, 'Q1 2025'))
    expect(csv.trim().split('\n')).toEqual([
      'order_date,amount,note,ok,at',
      '2025-03-01,1234.5,"a, b",TRUE,2025-03-01 14:05:00',
      '2025-12-31,-2,x,FALSE,',
    ])
    xlsxApi.close(id)
  })

  it('rejects unknown workbooks and sheets', () => {
    expect(() => xlsxApi.toCsv('nope', 'Sheet1')).toThrow('Sheet "Sheet1" not found')
  })
})

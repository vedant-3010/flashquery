import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// M1 data engine: sample data, uploads of every format, errors, catalog and preview.

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url))

const text = (name: string, content: string, mimeType = 'text/plain') => ({
  name,
  mimeType,
  buffer: Buffer.from(content),
})

async function upload(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.getByTestId('file-input').first().setInputFiles(files)
}

const dataset = (page: Page, label: string) => page.getByRole('region', { name: label })

test.describe('sample data (F-DATA-05)', () => {
  test('generates Global Sales, profiles it and previews rows', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Try sample data' }).click()
    await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()

    const sales = dataset(page, 'Global Sales · 10k rows')
    await expect(sales).toContainText('global_sales · 10K rows · 14 columns')
    await expect(sales).toContainText('Generated in your browser')

    // Column profile popover (F-PROF-01, F-PROF-02).
    await sales.getByRole('button', { name: 'region' }).click()
    const profile = page.getByRole('dialog')
    await expect(profile).toContainText('Geography')
    await expect(profile).toContainText('Distinct5')
    await expect(profile).toContainText('APAC')
    await page.keyboard.press('Escape')

    await sales.getByRole('button', { name: 'Preview Global Sales · 10k rows' }).click()
    const panel = page.getByRole('complementary', { name: 'Side panel' })
    await expect(panel).toContainText('first 100 of 10,000 rows')
    await expect(panel.getByRole('columnheader', { name: 'order_date' })).toBeVisible()
    await expect(panel.getByRole('cell', { name: '2022-01-01' }).first()).toBeVisible()
  })

  test('loads a bundled CSV sample', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Try sample data' }).click()
    await page.getByRole('menuitem', { name: /HR attrition/ }).click()
    await expect(dataset(page, 'HR attrition (CSV)')).toContainText('hr_attrition · 1.5K rows')
    await expect(dataset(page, 'HR attrition (CSV)')).toContainText('comma-separated')
  })

  test('cancels a running load', async ({ page }) => {
    await page.goto('/')
    const menu = page.getByRole('button', { name: 'Try sample data' })
    await menu.click()
    await page.getByRole('menuitem', { name: 'Global Sales · 1M rows' }).click()
    await page.getByRole('button', { name: 'Cancel loading Global Sales · 1M rows' }).click()
    await expect(page.getByText('No datasets yet')).toBeVisible()

    // Engine work is serialized: once this later load finishes, a load that wasn't really
    // cancelled would have finished too.
    await menu.click()
    await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
    await expect(dataset(page, 'Global Sales · 10k rows')).toContainText('10K rows')
    const sidebar = page.getByRole('complementary', { name: 'Datasets' })
    await expect(sidebar.getByRole('region')).toHaveCount(1)
  })
})

test.describe('uploads (F-DATA-01..04)', () => {
  test('dropping three files creates three tables', async ({ page }) => {
    await page.goto('/')
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer()
      data.items.add(new File(['id,amount\n1,10\n2,20\n'], 'sales.csv', { type: 'text/csv' }))
      data.items.add(
        new File(['a\tb\n1\t2\n'], 'metrics.tsv', { type: 'text/tab-separated-values' }),
      )
      data.items.add(new File(['{"e":"view"}\n{"e":"click"}\n'], 'events.jsonl'))
      return data
    })
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer })
    await expect(page.getByText('Drop files to load them')).toBeVisible()
    await page.dispatchEvent('body', 'drop', { dataTransfer: transfer })

    await expect(dataset(page, 'sales.csv')).toContainText('sales · 2 rows')
    await expect(dataset(page, 'metrics.tsv')).toContainText('tab-separated')
    await expect(dataset(page, 'events.jsonl')).toContainText('events · 2 rows')
  })

  test('rejects unsupported files with a clear error', async ({ page }) => {
    await page.goto('/')
    await upload(page, [text('report.pdf', '%PDF-1.7', 'application/pdf')])
    await expect(page.getByRole('alert', { name: 'report.pdf' })).toContainText(
      "report.pdf isn't a supported file",
    )
  })

  test('reports the bad line, then skips bad rows on request (F-DATA-07)', async ({ page }) => {
    await page.goto('/')
    // The bad row sits after DuckDB's 20,480-row sniffing sample, so the type is inferred as DOUBLE.
    const rows = Array.from({ length: 20_500 }, (_, i) => `${i},${i}.5`).join('\n')
    await upload(page, [text('prices.csv', `id,price\n${rows}\n99999,n/a\n`, 'text/csv')])

    const error = page.getByRole('alert', { name: 'prices.csv' })
    await expect(error).toContainText("Row 20,502 couldn't be read")
    await error.getByRole('button', { name: 'Show details' }).click()
    await expect(error).toContainText('Original Line: 99999,n/a')
    await error.getByRole('button', { name: 'Skip bad rows' }).click()

    await expect(dataset(page, 'prices.csv')).toContainText('1 bad row skipped')
    await expect(dataset(page, 'prices.csv')).toContainText('20.5K rows')
  })

  test('picks a sheet from a multi-sheet workbook (F-DATA-03)', async ({ page }) => {
    await page.goto('/')
    await upload(page, [
      {
        name: 'workbook.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: fixture('workbook.xlsx'),
      },
    ])
    const sheets = page.getByRole('list', { name: 'Sheets' })
    await expect(sheets.getByRole('button')).toHaveText([/Q1 Sales/, /Targets/])
    await sheets.getByRole('button', { name: /Q1 Sales/ }).click()

    const q1 = dataset(page, 'workbook.xlsx · Q1 Sales')
    await expect(q1).toContainText('workbook_q1_sales · 3 rows')
    await expect(q1).toContainText('sheet “Q1 Sales”')
    await q1.getByRole('button', { name: 'month' }).click()
    await expect(page.getByRole('dialog')).toContainText('DATE')
  })

  test('loads Parquet and keeps nested JSON as text', async ({ page }) => {
    await page.goto('/')
    const json = JSON.stringify([
      { id: 1, tags: ['a', 'b'], meta: { ok: true } },
      { id: 2, tags: [], meta: { ok: false } },
    ])
    await upload(page, [
      {
        name: 'orders.parquet',
        mimeType: 'application/octet-stream',
        buffer: fixture('orders.parquet'),
      },
      text('nested.json', json, 'application/json'),
    ])

    await expect(dataset(page, 'orders.parquet')).toContainText('orders · 500 rows · 5 columns')
    const nested = dataset(page, 'nested.json')
    await expect(nested).toContainText('nested · 2 rows')
    await nested.getByRole('button', { name: 'tags' }).click()
    await expect(page.getByRole('dialog')).toContainText('VARCHAR')
  })
})

test.describe('managing tables (F-DATA-06)', () => {
  test('renames and removes a table', async ({ page }) => {
    await page.goto('/')
    await upload(page, [text('Monthly Sales.csv', 'month,total\n1,10\n2,20\n', 'text/csv')])
    const item = dataset(page, 'Monthly Sales.csv')
    await expect(item).toContainText('monthly_sales · 2 rows')

    await item.getByRole('button', { name: 'Actions for Monthly Sales.csv' }).click()
    await page.getByRole('menuitem', { name: 'Rename…' }).click()
    await page.getByLabel('Display name').fill('Sales by month')
    await page.getByLabel('SQL table name').fill('select')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toContainText('avoid SQL keywords')
    await page.getByLabel('SQL table name').fill('sales_by_month')
    await page.getByRole('button', { name: 'Save' }).click()

    const renamed = dataset(page, 'Sales by month')
    await expect(renamed).toContainText('sales_by_month · 2 rows')
    await renamed.getByRole('button', { name: 'Preview Sales by month' }).click()
    await expect(page.getByRole('complementary', { name: 'Side panel' })).toContainText(
      'sales_by_month · first 2 of 2 rows',
    )

    await renamed.getByRole('button', { name: 'Actions for Sales by month' }).click()
    await page.getByRole('menuitem', { name: 'Remove…' }).click()
    await page.getByRole('button', { name: 'Remove' }).click()
    await expect(renamed).toBeHidden()
    await expect(page.getByText('No datasets yet')).toBeVisible()
  })
})

test.describe('engine status (F-SHELL-03)', () => {
  test('reports DuckDB ready with its version', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Engine ready' }).click()
    await expect(page.getByRole('dialog')).toContainText(/DuckDB v\d+\.\d+\.\d+ · ready/)
    await expect(page.getByRole('dialog')).toContainText('Python')
  })
})

import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// M2: virtualized grid (F-GRID-01..03), SQL scratchpad (F-EXPL-07), export (F-EXP-01).

async function loadSample(page: Page, label: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try sample data' }).click()
  await page.getByRole('menuitem', { name: label }).click()
  await expect(page.getByRole('region', { name: label })).toBeVisible({ timeout: 60_000 })
}

async function runSql(page: Page, sql: string) {
  await page.getByRole('tab', { name: 'SQL' }).click()
  const editor = page.getByLabel('SQL query')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(sql)
  await page.keyboard.press('ControlOrMeta+Enter')
}

const results = (page: Page) => page.getByRole('grid', { name: 'Query results' })
const cell = (page: Page, row: number, column: number) =>
  results(page).getByRole('row').nth(row).getByRole('gridcell').nth(column)

test.describe('SQL scratchpad (F-EXPL-07)', () => {
  test('runs a query with Ctrl/Cmd+Enter and shows the result', async ({ page }) => {
    await loadSample(page, 'Global Sales · 10k rows')
    await runSql(
      page,
      'select region, count(*) as orders from global_sales group by all order by region',
    )

    await expect(page.getByText(/^5 rows · [\d.,]+ m?s$/)).toBeVisible()
    await expect(cell(page, 1, 0)).toHaveText('APAC')
    await expect(page.getByText('5 rows · 2 columns')).toBeVisible()
  })

  test('shows SQL errors with details and refuses anything but a query', async ({ page }) => {
    await loadSample(page, 'Global Sales · 10k rows')
    await runSql(page, 'select nope from global_sales')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Binder Error')
    await alert.getByRole('button', { name: 'Show details' }).click()
    await expect(alert).toContainText('nope')

    await runSql(page, 'drop table global_sales')
    await expect(page.getByRole('alert')).toContainText('Parser Error: syntax error')
    await runSql(page, 'select count(*) as n from global_sales')
    await expect(cell(page, 1, 0)).toHaveText('10,000')
  })

  test('formats SQL', async ({ page }) => {
    await loadSample(page, 'Global Sales · 10k rows')
    await runSql(page, 'select region,sum(revenue) from global_sales group by all')
    await page.getByRole('button', { name: 'Format' }).click()
    await expect(page.getByLabel('SQL query')).toContainText('SELECT')
    await expect(page.getByLabel('SQL query')).toContainText('GROUP BY ALL')
  })

  test('autocompletes tables and columns (F-EXPL-08)', async ({ page }) => {
    await loadSample(page, 'Global Sales · 10k rows')
    await page.getByRole('tab', { name: 'SQL' }).click()
    await page.getByLabel('SQL query').click()
    await page.keyboard.type('select * from glob')
    const options = page.getByRole('listbox').getByRole('option')
    await expect(options.first()).toHaveText(/global_sales/)
    await page.keyboard.press('Enter')

    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('select reg')
    await expect(options.first()).toHaveText(/region/)
  })

  test('opens a table from the side panel preview', async ({ page }) => {
    await loadSample(page, 'Global Sales · 10k rows')
    await page.getByRole('button', { name: 'Preview Global Sales · 10k rows' }).click()
    const panel = page.getByRole('complementary', { name: 'Side panel' })
    await panel.getByRole('button', { name: 'Open in SQL' }).click()

    await expect(page.getByRole('tab', { name: 'SQL' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByLabel('SQL query')).toContainText('SELECT * FROM global_sales')
    await expect(page.getByText('10,000 rows · 14 columns').first()).toBeVisible()
  })
})

test.describe('grid (F-GRID-01..03)', () => {
  test('sorts in DuckDB: numbers high-to-low first, Shift-click adds a column', async ({
    page,
  }) => {
    await loadSample(page, 'Global Sales · 10k rows')
    await runSql(
      page,
      'select region, channel, count(*) as orders from global_sales group by all order by all',
    )
    const grid = results(page)
    await expect(cell(page, 1, 0)).toHaveText('APAC')

    await grid.getByRole('button', { name: /^orders/ }).click()
    await expect(grid.getByRole('columnheader', { name: /orders/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await expect(cell(page, 1, 1)).toHaveText('Online')

    await grid.getByRole('button', { name: /^region/ }).click({ modifiers: ['Shift'] })
    await expect(grid.getByRole('columnheader', { name: /region/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await expect(grid.getByRole('columnheader', { name: /orders/ })).toContainText('1')
    await page.getByRole('button', { name: 'Clear sort' }).click()
    await expect(cell(page, 1, 1)).toHaveText('Online')
    await expect(cell(page, 1, 0)).toHaveText('APAC')
  })

  test('formats cells by type and switches date display', async ({ page }) => {
    await loadSample(page, 'Global Sales · 10k rows')
    await runSql(
      page,
      `select order_id, order_date, revenue, returned, null as nothing
       from global_sales where order_id = 1`,
    )
    await expect(cell(page, 1, 0)).toHaveText('1')
    await expect(cell(page, 1, 1)).toHaveText('2022-01-01')
    await expect(cell(page, 1, 4)).toHaveText('null')

    await page.getByRole('button', { name: 'Show dates in your locale' }).click()
    await expect(cell(page, 1, 1)).toHaveText('Jan 1, 2022')
  })

  test('scrolls to the last of 1M rows', async ({ page }) => {
    test.setTimeout(120_000)
    await loadSample(page, 'Global Sales · 1M rows')
    await runSql(page, 'select * from global_sales')
    const grid = results(page)
    await expect(page.getByText('1,000,000 rows · 14 columns')).toBeVisible()

    // Taller than browsers allow: the grid scales its scroll range (MAX_SCROLL_HEIGHT).
    await grid.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
    await expect(grid.getByRole('rowheader').last()).toHaveText('1000000')
    await expect(grid.getByRole('row').last().getByRole('gridcell').first()).toHaveText('1000000')

    await grid.evaluate((element) => element.scrollTo({ top: element.scrollHeight / 2 }))
    await expect(grid.getByRole('rowheader').first()).toHaveText(/^(49\d{4}|50\d{4})$/)
  })
})

test.describe('export (F-EXP-01)', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('downloads CSV and Parquet and copies TSV, in grid order', async ({ page }) => {
    await loadSample(page, 'Global Sales · 10k rows')
    await runSql(page, 'select region, count(*) as orders from global_sales group by all')
    await results(page)
      .getByRole('button', { name: /^region/ })
      .click()

    await page.getByRole('button', { name: 'Export' }).click()
    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Download CSV' }).click(),
    ])
    expect(csv.suggestedFilename()).toBe('query_result.csv')
    const lines = readFileSync(await csv.path(), 'utf8')
      .trim()
      .split('\n')
    expect(lines[0]).toBe('region,orders')
    expect(lines.slice(1).map((line) => line.split(',')[0])).toEqual([
      'APAC',
      'Europe',
      'LATAM',
      'MEA',
      'North America',
    ])

    await page.getByRole('button', { name: 'Export' }).click()
    const [parquet] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Download Parquet' }).click(),
    ])
    expect(
      readFileSync(await parquet.path())
        .subarray(0, 4)
        .toString(),
    ).toBe('PAR1')

    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: 'Copy as TSV' }).click()
    await expect(page.getByText('Copied 5 rows')).toBeVisible()
    const tsv = await page.evaluate(() => navigator.clipboard.readText())
    expect(tsv.split('\n')[1]).toMatch(/^APAC\t\d+$/)
  })

  test('limits TSV copies to 10,000 rows', async ({ page }) => {
    await loadSample(page, 'Global Sales · 100k rows')
    await runSql(page, 'select * from global_sales')
    await expect(page.getByText('100,000 rows · 14 columns')).toBeVisible()
    await page.getByRole('button', { name: 'Export' }).click()
    await expect(
      page.getByRole('menuitem', { name: /Copy as TSV \(up to 10,000 rows\)/ }),
    ).toHaveAttribute('aria-disabled', 'true')
  })
})

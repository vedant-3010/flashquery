import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// M4 in demo mode: automatic charts, the switcher and settings, export, KPIs, currency, and the
// SQL scratchpad's chart (F-VIZ-01…07, F-EXPL-03, F-EXPL-07).

async function loadSales(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
    timeout: 60_000,
  })
}

async function ask(page: Page, question: string) {
  const composer = page.getByRole('textbox', { name: 'Ask a question' })
  await composer.fill(question)
  await composer.press('Enter')
  const answer = page.getByRole('article', { name: question }).last()
  await expect(answer.getByRole('tab', { name: 'Chart', selected: true })).toBeVisible()
  return answer
}

test.describe('answer charts (F-VIZ-01…04, F-ASK-08)', () => {
  test('switches chart type, explains unfit ones, and resets', async ({ page }) => {
    await loadSales(page)
    const answer = await ask(page, 'Top 10 products by revenue in 2025')
    await expect(answer.getByRole('img', { name: /^Horizontal bar chart: / })).toBeVisible()

    await answer.getByRole('button', { name: 'Chart type: Horizontal bar' }).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitemradio', { name: /Donut/ })).toBeDisabled()
    await expect(menu.getByRole('menuitemradio', { name: /Donut/ })).toContainText(
      'A donut works for 2–6 slices, and product has 10.',
    )
    await menu.getByRole('menuitemradio', { name: 'Bar', exact: true }).click()
    await expect(answer.getByRole('img', { name: /^Bar chart: / })).toBeVisible()
    await expect(answer).toContainText('Why this chart: You picked this chart.')

    await answer.getByRole('button', { name: 'Reset' }).click()
    await expect(answer.getByRole('img', { name: /^Horizontal bar chart: / })).toBeVisible()
    await expect(answer.getByRole('button', { name: 'Reset' })).toBeHidden()

    await answer.getByRole('button', { name: 'View as table' }).click()
    await expect(answer.getByRole('tab', { name: 'Table', selected: true })).toBeVisible()
  })

  test('re-fits the chart to another column from the settings popover', async ({ page }) => {
    await loadSales(page)
    const answer = await ask(page, 'Which category has the highest profit margin?')
    const chart = answer.getByRole('img', { name: /^Bar chart: / })
    await expect(chart).toHaveAttribute('aria-label', /Highest Apparel \(\d+%\)/)

    await answer.getByRole('button', { name: 'Chart settings' }).click()
    await page.getByRole('combobox', { name: 'Value' }).click()
    await page.getByRole('option', { name: 'Profit', exact: true }).click()
    await expect(chart).not.toHaveAttribute('aria-label', /%/)
    await expect(answer.getByRole('button', { name: 'Reset' })).toBeVisible()
  })

  test('shows single numbers as KPIs', async ({ page }) => {
    await loadSales(page)
    const answer = await ask(page, 'What was total revenue in 2025?')
    const kpi = answer.getByRole('listitem').filter({ hasText: 'Total revenue' })
    await expect(kpi).toContainText(/\d+(\.\d)?[KM]/)
    await expect(answer.getByRole('button', { name: 'Chart type: KPI' })).toBeVisible()
  })

  test('exports the chart as PNG and SVG', async ({ page }) => {
    await loadSales(page)
    const answer = await ask(page, 'Which region grew fastest?')
    await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible()

    await answer.getByRole('button', { name: 'Export chart' }).click()
    const pngDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Download PNG' }).click()
    const png = await pngDownload
    expect(png.suggestedFilename()).toBe('revenue_growth_by_region_2022_to_2025.png')
    const pngBytes = readFileSync((await png.path()) ?? '')
    expect(pngBytes.subarray(1, 4).toString()).toBe('PNG')

    await answer.getByRole('button', { name: 'Export chart' }).click()
    const svgDownload = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Download SVG' }).click()
    const svg = readFileSync((await (await svgDownload).path()) ?? '', 'utf8')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('APAC')
  })

  test('formats money in the currency chosen in settings (F-VIZ-04)', async ({ page }) => {
    await loadSales(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('combobox', { name: 'Currency for money columns' }).click()
    await page.getByRole('option', { name: 'EUR' }).click()
    await page.keyboard.press('Escape')

    const answer = await ask(page, 'Revenue by country in APAC')
    await expect(answer.getByRole('img', { name: /^Bar chart: / })).toHaveAttribute(
      'aria-label',
      /€/,
    )
  })
})

test.describe('SQL scratchpad charts (F-EXPL-07, F-VIZ-05)', () => {
  async function runSql(page: Page, sql: string) {
    await page.getByRole('tab', { name: 'SQL' }).first().click()
    const editor = page.getByLabel('SQL query')
    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type(sql)
    await page.keyboard.press('ControlOrMeta+Enter')
  }

  test('bins one measure into a histogram in DuckDB', async ({ page }) => {
    await loadSales(page)
    await runSql(page, 'SELECT revenue FROM global_sales')
    await page.getByRole('tab', { name: 'Chart' }).click()
    await expect(
      page.getByRole('img', { name: /^Histogram chart: Distribution of revenue\./ }),
    ).toBeVisible()
    await expect(page.getByText(/bins are counted in the database/)).toBeVisible()
  })

  test('samples a big scatter in SQL and says so', async ({ page }) => {
    await loadSales(page)
    await runSql(page, 'SELECT unit_price, revenue FROM global_sales')
    await page.getByRole('tab', { name: 'Chart' }).click()
    await expect(page.getByRole('img', { name: /^Scatter chart: .* 5000 points\./ })).toBeVisible()
    await expect(page.getByText('A random sample of 5,000 of 10,000 rows is shown.')).toBeVisible()
    await page.getByRole('button', { name: 'View as table' }).click()
    await expect(page.getByRole('grid', { name: 'Query results' })).toBeVisible()
  })
})

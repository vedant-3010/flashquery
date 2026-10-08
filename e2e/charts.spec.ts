import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// M4 in demo mode: automatic charts, the switcher and settings, export, KPIs, currency, and the
// SQL scratchpad's chart (F-VIZ-01…07, F-EXPL-03, F-EXPL-07).

async function loadSales(page: Page) {
  await page.goto('/app/')
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

async function runSql(page: Page, sql: string) {
  await page.getByRole('tab', { name: 'SQL' }).first().click()
  const editor = page.getByLabel('SQL query')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(sql)
  // Close the autocomplete list, so it can't cover the editor next time.
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+Enter')
}

/** Runs SQL in the scratchpad and returns its chart's text alternative once drawn. */
async function scratchChart(page: Page, sql: string, name: RegExp) {
  await runSql(page, sql)
  await page.getByRole('tab', { name: 'Chart' }).click()
  const chart = page.getByRole('img', { name })
  await expect(chart).toBeVisible()
  return chart
}

/** Picks a chart type from the switcher (F-VIZ-03). */
async function switchTo(page: Page, type: string) {
  await page.getByRole('button', { name: /^Chart type:/ }).click()
  await page.getByRole('menuitemradio', { name: new RegExp(`^${type}`) }).click()
}

/** The chart's SVG export (F-VIZ-07), to check the colours it was drawn with. */
async function exportedSvg(page: Page, scope: Page | ReturnType<Page['getByRole']>) {
  await scope.getByRole('button', { name: 'Export chart' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download SVG' }).click()
  return readFileSync((await (await download).path()) ?? '', 'utf8').toLowerCase()
}

test.describe('SQL scratchpad charts (F-EXPL-07, F-VIZ-05)', () => {
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

test.describe('annotations (F-VIZ-08)', () => {
  test('adds an average and a target line, described in the text alternative', async ({ page }) => {
    await loadSales(page)
    const answer = await ask(page, 'Which region grew fastest?')
    await answer.getByRole('button', { name: 'Chart settings' }).click()
    const settings = page.getByRole('dialog')
    await settings.getByRole('checkbox', { name: 'Mark highest and lowest' }).check()
    await settings.getByRole('checkbox', { name: 'Average line' }).check()
    const target = settings.getByRole('textbox', { name: 'Target (%)' })
    await target.fill('50')
    await target.press('Enter')
    await page.keyboard.press('Escape')

    const chart = answer.getByRole('img', { name: /^Bar chart/ })
    await expect(chart).toHaveAccessibleName(
      /With highest and lowest values marked, average line at [\d.]+%, target line at 50%\./,
    )
  })
})

test.describe('v2 charts (F-VIZ-09…12)', () => {
  test('picks the new chart types on its own', async ({ page }) => {
    await loadSales(page)
    await scratchChart(page, 'SELECT region, revenue FROM global_sales', /^Box plot chart: /)
    await expect(page.getByText(/values? lies? beyond the whiskers/)).toBeVisible()
    await scratchChart(
      page,
      'SELECT region AS source, channel AS target, sum(revenue) AS revenue FROM global_sales GROUP BY ALL',
      /^Sankey chart: .* 15 flows/,
    )
    await scratchChart(
      page,
      "SELECT * FROM (VALUES ('Visited', 12000), ('Signed up', 4800), ('Paid', 900)) AS t(stage, users)",
      /^Funnel chart: .*Visited 12,000, Signed up 4,800, Paid 900/,
    )
    await scratchChart(
      page,
      'SELECT region, sum(revenue) AS revenue, avg(discount) AS avg_discount FROM global_sales GROUP BY ALL',
      /^Bar and line chart: /,
    )
  })

  test('draws a waterfall; switches to calendar, treemap, 100% stacked and a KPI with its trend', async ({
    page,
  }) => {
    await loadSales(page)
    // Signed changes in a column named as a change: a waterfall on its own (rule 15).
    await scratchChart(
      page,
      'SELECT region, sum(revenue) FILTER (WHERE year(order_date) = 2025) - sum(revenue) FILTER (WHERE year(order_date) = 2024) AS revenue_change FROM global_sales GROUP BY ALL',
      /^Waterfall chart: .*5 steps adding up to/,
    )

    await scratchChart(
      page,
      'SELECT CAST(order_date AS DATE) AS day, count(*) AS orders FROM global_sales WHERE year(order_date) = 2025 GROUP BY ALL ORDER BY 1',
      /^Line chart: /,
    )
    await switchTo(page, 'Calendar')
    await expect(page.getByRole('img', { name: /^Calendar chart: .*365 days/ })).toBeVisible()

    await scratchChart(
      page,
      'SELECT country, sum(revenue) AS revenue FROM global_sales GROUP BY ALL',
      /^Horizontal bar chart: /,
    )
    await switchTo(page, 'Treemap')
    await expect(page.getByRole('img', { name: /^Treemap chart: .*19 tiles/ })).toBeVisible()

    await scratchChart(
      page,
      'SELECT region, channel, sum(revenue) AS revenue FROM global_sales GROUP BY ALL',
      /^Stacked bar chart: /,
    )
    await switchTo(page, '100% stacked bar')
    await expect(page.getByRole('img', { name: /^100% stacked bar chart: / })).toBeVisible()

    await scratchChart(
      page,
      "SELECT date_trunc('month', order_date) AS month, sum(revenue) AS revenue FROM global_sales GROUP BY ALL ORDER BY 1",
      /^Line chart: /,
    )
    await switchTo(page, 'KPI')
    await expect(page.getByText(/^Latest: Dec 2025$/)).toBeVisible()
    await expect(page.getByText(/vs Nov 2025/)).toBeVisible()
  })

  test('chart colors: the default, one picked in Settings, and a chart of its own (F-VIZ-12)', async ({
    page,
  }) => {
    await loadSales(page)
    const answer = await ask(page, 'Which region grew fastest?')
    await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible()
    // The default palette leads with violet.
    expect(await exportedSvg(page, answer)).toContain('#7c1ccd')

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('combobox', { name: 'Chart colors' }).click()
    await page.getByRole('option', { name: 'Okabe–Ito' }).click()
    await page.keyboard.press('Escape')
    const okabe = await exportedSvg(page, answer)
    expect(okabe).toContain('#4587df')
    expect(okabe).not.toContain('#7c1ccd')

    await answer.getByRole('button', { name: 'Chart settings' }).click()
    await page.getByRole('combobox', { name: 'Colors' }).click()
    await page.getByRole('option', { name: 'Mono' }).click()
    await page.keyboard.press('Escape')
    expect(await exportedSvg(page, answer)).toContain('#4d2090')
  })
})

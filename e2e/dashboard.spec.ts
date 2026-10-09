import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// M5 in demo mode: J4 (generate → edit → filter → export → reload → re-load data → refresh),
// pinning (F-DASH-01), editing and text tiles, import, several dashboards (F-DASH-01…10).

const SAMPLE = 'Global Sales · 10k rows'

async function loadSales(page: Page) {
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: SAMPLE }).click()
  await expect(page.getByRole('region', { name: SAMPLE })).toBeVisible({ timeout: 60_000 })
}

const tile = (page: Page, title: string) =>
  page.getByRole('main').getByRole('region', { name: title, exact: true })

async function tileAction(page: Page, title: string, action: string) {
  await page.getByRole('button', { name: `Actions for ${title}` }).click()
  await page.getByRole('menuitem', { name: action }).click()
}

async function generateDashboard(page: Page) {
  await page.getByRole('tab', { name: 'Dashboard' }).click()
  await expect(page.getByText('No tiles yet')).toBeVisible()
  await page.getByRole('button', { name: 'Generate dashboard' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Generate a dashboard' })
  await expect(dialog).toContainText('Demo mode builds the Global Sales dashboard')
  await dialog.getByRole('button', { name: 'Generate' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

async function ask(page: Page, question: string) {
  await page.getByRole('tab', { name: 'Workspace' }).click()
  const composer = page.getByRole('textbox', { name: 'Ask a question' })
  await composer.fill(question)
  await composer.press('Enter')
  const answer = page.getByRole('article', { name: question }).last()
  await expect(answer.getByRole('tab', { name: 'Chart' })).toBeVisible()
  return answer
}

test.describe('J4: dashboard (F-DASH-02…10)', () => {
  test('generate, edit, filter, export, reload, re-load the data, refresh', async ({ page }) => {
    await page.goto('/app/')
    await loadSales(page)
    await generateDashboard(page)

    // The AI (demo fixture) proposes 6 tiles: KPIs, a trend, breakdowns.
    await expect(
      page.getByRole('button', { name: 'Dashboard: Global Sales overview' }),
    ).toBeVisible()
    for (const title of [
      'Total revenue',
      'Orders',
      'Average order value',
      'Monthly revenue',
      'Revenue by region',
      'Revenue share by channel',
    ]) {
      await expect(tile(page, title)).toBeVisible()
    }
    await expect(
      tile(page, 'Monthly revenue').getByRole('img', { name: /^Line chart/ }),
    ).toBeVisible()
    await expect(
      tile(page, 'Revenue share by channel').getByRole('img', { name: /^Donut chart/ }),
    ).toBeVisible()

    // Remove one; resize others (by dragging the corner, and from the menu).
    await tileAction(page, 'Orders', 'Remove')
    await expect(tile(page, 'Orders')).toBeHidden()
    const region = tile(page, 'Revenue by region')
    const before = (await region.boundingBox())?.width ?? 0
    const handle = page
      .locator('.react-grid-item')
      .filter({ has: page.getByRole('region', { name: 'Revenue by region', exact: true }) })
      .locator('.react-resizable-handle')
    await region.hover()
    const box = await handle.boundingBox()
    if (!box) throw new Error('no resize handle')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 250, box.y + 40, { steps: 8 })
    await page.mouse.up()
    await expect
      .poll(async () => (await region.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before + 100)
    await tileAction(page, 'Revenue share by channel', 'Size')
    await page.getByRole('menuitem', { name: 'Full width' }).click()

    // A date-range filter applies to every tile.
    const total = tile(page, 'Total revenue')
    const unfiltered = await total.textContent()
    await page.getByRole('button', { name: 'Add filter' }).click()
    await page.getByRole('combobox', { name: 'Filter by' }).click()
    await page.getByRole('option', { name: 'Order date' }).click()
    await page.getByRole('button', { name: '2025', exact: true }).click()
    await page.getByRole('button', { name: 'Apply to every tile' }).click()
    await expect(page.getByRole('group', { name: 'Filters' })).toContainText(
      'Order date: 2025-01-01 – 2025-12-31',
    )
    await expect(total.getByText('Filtered')).toBeVisible()
    await expect(total).not.toHaveText(unfiltered ?? '')

    // Export with snapshots.
    await page.getByRole('button', { name: 'More dashboard actions' }).click()
    // The menu is as wide as its items, not as its icon trigger: one line each.
    const exportItem = page.getByRole('menuitem', { name: 'Export JSON (with data snapshots)' })
    expect((await exportItem.boundingBox())?.height).toBeLessThan(36)
    const download = page.waitForEvent('download')
    await exportItem.click()
    const file = JSON.parse(readFileSync((await (await download).path()) ?? '', 'utf8'))
    expect(file).toMatchObject({ format: 'flashQuery-dashboard', version: 1 })
    expect(file.dashboard.tiles).toHaveLength(5)
    expect(file.dashboard.filters).toEqual([
      {
        kind: 'date',
        table: 'global_sales',
        column: 'order_date',
        from: '2025-01-01',
        to: '2025-12-31',
      },
    ])

    // Reload: tiles render from their snapshots and say what to load.
    const filteredTotal = await total.locator('ul').textContent()
    await page.waitForTimeout(700) // the 500 ms debounced save
    await page.reload()
    await page.getByRole('tab', { name: 'Dashboard' }).click()
    await expect(total.locator('ul')).toHaveText(filteredTotal ?? '')
    await expect(total).toContainText(`Load the ${SAMPLE} sample to refresh.`)
    await expect(total).toContainText('Snapshot from')

    // Re-load the data: the tiles refresh.
    await loadSales(page)
    await expect(total).toContainText('Updated')
    await expect(total).not.toContainText('to refresh.')
    await expect(total.locator('ul')).toHaveText(filteredTotal ?? '')
  })
})

test.describe('pinning and editing (F-DASH-01, F-DASH-06, F-DASH-07)', () => {
  test('pins an answer, shows it on the dashboard, and edits it', async ({ page }) => {
    await page.goto('/app/')
    await loadSales(page)
    const answer = await ask(page, 'Top 10 products by revenue in 2025')
    await answer.getByRole('button', { name: 'Pin to dashboard' }).click()
    await page.getByRole('menuitem', { name: 'Pin chart' }).click()
    const toast = page.getByRole('status').filter({ hasText: 'Pinned to My dashboard.' })
    await expect(toast).toBeVisible()
    await toast.getByRole('button', { name: 'View' }).click()

    const pinned = tile(page, 'Top 10 products by revenue, 2025')
    await expect(pinned).toBeFocused()
    await expect(pinned.getByRole('img', { name: /^Horizontal bar chart/ })).toBeVisible()

    // Edit: title and chart type, previewed with the SQL before saving.
    await tileAction(page, 'Top 10 products by revenue, 2025', 'Edit…')
    const sheet = page.getByRole('dialog', { name: 'Edit tile' })
    await sheet.getByLabel('Title').fill('Best sellers 2025')
    await sheet.getByRole('button', { name: 'Chart type: Horizontal bar' }).click()
    await page.getByRole('menuitemradio', { name: 'Bar', exact: true }).click()
    await expect(sheet.getByRole('button', { name: 'Chart type: Bar' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Save' }).click()
    const edited = tile(page, 'Best sellers 2025')
    await expect(edited.getByRole('img', { name: /^Bar chart/ })).toBeVisible()

    // A text tile, and both survive a reload.
    await page.getByRole('button', { name: 'Add text' }).click()
    await tileAction(page, 'Notes', 'Edit…')
    await sheet
      .getByLabel('Text (markdown)')
      .fill('## Takeaways\n\n- Laptops lead\n- **Bikes** next')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(tile(page, 'Notes').getByRole('heading', { name: 'Takeaways' })).toBeVisible()
    await expect(tile(page, 'Notes').getByRole('listitem')).toHaveCount(2)

    await page.waitForTimeout(700)
    await page.reload()
    await page.getByRole('tab', { name: 'Dashboard' }).click()
    await expect(edited.getByRole('img', { name: /^Bar chart/ })).toBeVisible()
    await expect(tile(page, 'Notes')).toContainText('Bikes next')
  })

  test('pins a query from history, as a table', async ({ page }) => {
    await page.goto('/app/')
    await loadSales(page)
    await ask(page, 'What is total revenue by year?')
    await page.getByRole('button', { name: 'Side panel' }).click()
    const panel = page.getByRole('complementary', { name: 'Side panel' })
    await panel.getByRole('tab', { name: 'History' }).click()
    await panel.getByRole('button', { name: 'Pin to dashboard' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Pinned to' })).toBeVisible()
    await page.getByRole('tab', { name: 'Dashboard' }).click()
    await expect(tile(page, 'What is total revenue by year?')).toBeVisible()
  })
})

test.describe('dashboards and files (F-DASH-05, F-DASH-08)', () => {
  test('creates, renames and deletes dashboards; imports exported files', async ({ page }) => {
    await page.goto('/app/')
    await loadSales(page)
    await generateDashboard(page)

    await page.getByRole('button', { name: 'More dashboard actions' }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Export JSON (layout and SQL only)' }).click()
    const path = (await (await download).path()) ?? ''
    expect(JSON.parse(readFileSync(path, 'utf8')).dashboard.tiles[0].snapshot).toBeNull()

    await page.getByTestId('dashboard-import').setInputFiles(path)
    await expect(
      page.getByRole('button', { name: 'Dashboard: Global Sales overview 2' }),
    ).toBeVisible()
    // Imported without data: the tiles run on the loaded sample.
    await expect(tile(page, 'Total revenue')).toContainText('Updated')

    await page.getByTestId('dashboard-import').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"something else"}'),
    })
    await expect(page.getByRole('status').filter({ hasText: "Couldn't import" })).toBeVisible()

    const switcher = () => page.getByRole('button', { name: /^Dashboard: / })
    await switcher().click()
    await page.getByRole('menuitem', { name: 'Rename…' }).click()
    await page
      .getByRole('dialog', { name: 'Rename dashboard' })
      .getByLabel('Name')
      .fill('Copy for review')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Dashboard: Copy for review' })).toBeVisible()

    await switcher().click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(
      page.getByRole('button', { name: 'Dashboard: Global Sales overview' }),
    ).toBeVisible()

    await switcher().click()
    await page.getByRole('menuitem', { name: 'New dashboard' }).click()
    await expect(page.getByRole('button', { name: 'Dashboard: My dashboard' })).toBeVisible()
    await expect(page.getByText('No tiles yet')).toBeVisible()
  })
})

test.describe('presentation mode (F-DASH-13)', () => {
  test('shows the dashboard full screen, read-only; Esc ends it', async ({ page }) => {
    await page.goto('/app/')
    await loadSales(page)
    await generateDashboard(page)
    await page.getByRole('button', { name: 'Present' }).click()

    const stage = page.getByRole('region', { name: 'Presenting Global Sales overview' })
    await expect(stage.getByRole('heading', { name: 'Global Sales overview' })).toBeVisible()
    await expect(stage.getByRole('region', { name: 'Total revenue', exact: true })).toBeVisible()
    await expect(stage.getByRole('button', { name: /^Actions for/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Generate dashboard' })).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(stage).toBeHidden()
    await expect(page.getByRole('button', { name: 'Present' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Actions for Total revenue' })).toBeVisible()
  })
})

test.describe('cross-filtering (F-DASH-11)', () => {
  test('clicking a bar filters every tile; clicking it again clears the filter', async ({
    page,
  }) => {
    await page.goto('/app/')
    await loadSales(page)
    await generateDashboard(page)
    const filters = page.getByRole('group', { name: 'Filters' })
    await expect(filters).toContainText('or click a bar or slice')

    // The tallest bar (APAC, sorted first) sits at the left of the plot.
    const chart = tile(page, 'Revenue by region').getByRole('img', { name: /^Bar chart/ })
    await expect(chart).toBeVisible()
    const box = await chart.boundingBox()
    if (!box) throw new Error('no chart box')
    const firstBar = { x: 60 + (box.width - 70) / 10, y: box.height * 0.7 }
    await chart.click({ position: firstBar })
    await expect(filters).toContainText('Region: APAC')
    await expect(tile(page, 'Total revenue').getByText('Filtered')).toBeVisible()

    await chart.click({ position: firstBar })
    await expect(filters).not.toContainText('Region: APAC')
    await expect(tile(page, 'Total revenue').getByText('Filtered')).toBeHidden()
  })
})

test.describe('export as HTML and PDF (F-DASH-12)', () => {
  test('downloads a standalone HTML file and opens it for printing', async ({ page }) => {
    await page.goto('/app/')
    await loadSales(page)
    await generateDashboard(page)
    await expect(tile(page, 'Revenue by region').getByRole('img')).toBeVisible()

    await page.getByRole('button', { name: 'More dashboard actions' }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Download as HTML (standalone)' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('global-sales-overview.html')
    const html = readFileSync(await file.path(), 'utf8')
    expect(html).toContain('<title>Global Sales overview</title>')
    expect(html).toContain("default-src 'none'")
    expect(html).not.toContain('<script')
    expect(html.match(/<svg/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(html).toContain('<h2>Total revenue</h2>')

    await page.getByRole('button', { name: 'More dashboard actions' }).click()
    const popup = page.waitForEvent('popup')
    await page.getByRole('menuitem', { name: 'Print or save as PDF…' }).click()
    const printTab = await popup
    await expect(printTab).toHaveTitle('Global Sales overview')
    expect(printTab.url()).toMatch(/^blob:/)
  })
})

test.describe('chart colors on a dashboard (F-VIZ-12)', () => {
  test('a tile keeps the colors picked for it: saved, exported, and after a reload', async ({
    page,
  }) => {
    await page.goto('/app/')
    await loadSales(page)
    await generateDashboard(page)
    const revenue = tile(page, 'Revenue by region')
    await expect(revenue.getByRole('img')).toBeVisible()

    await tileAction(page, 'Revenue by region', 'Edit…')
    const sheet = page.getByRole('dialog', { name: 'Edit tile' })
    await sheet.getByRole('button', { name: 'Chart settings' }).click()
    await page.getByRole('combobox', { name: 'Colors' }).click()
    await page.getByRole('option', { name: 'Mono' }).click()
    await page.keyboard.press('Escape')
    await expect(sheet.getByRole('button', { name: 'Save' })).toBeEnabled()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()

    // The export draws the tile with its own colors (Mono's darkest violet).
    const exported = async () => {
      await page.getByRole('button', { name: 'More dashboard actions' }).click()
      const download = page.waitForEvent('download')
      await page.getByRole('menuitem', { name: 'Download as HTML (standalone)' }).click()
      return readFileSync(await (await download).path(), 'utf8').toLowerCase()
    }
    expect(await exported()).toContain('#4d2090')

    // Saved with the tile: drawn in Mono after a reload too, from its snapshot.
    await page.waitForTimeout(700)
    await page.reload()
    await page.getByRole('tab', { name: 'Dashboard' }).click()
    await expect(revenue.getByRole('img')).toBeVisible()
    expect(await exported()).toContain('#4d2090')
  })
})

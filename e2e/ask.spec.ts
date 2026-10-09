import { expect, test, type Page } from '@playwright/test'

// M3 in demo mode (no API key): J1, answer cards, the SQL/Explanation/Trace tabs, edited SQL
// through the guard, and history. The fixture answers run live SQL on the generated sample.

async function loadSales(page: Page, label = 'Global Sales · 10k rows') {
  await page.goto('/app/')
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: label }).click()
  await expect(page.getByRole('region', { name: label })).toBeVisible({ timeout: 60_000 })
}

const composer = (page: Page) => page.getByRole('textbox', { name: 'Ask a question' })
const card = (page: Page, question: string) => page.getByRole('article', { name: question })

async function ask(page: Page, question: string) {
  await composer(page).fill(question)
  await composer(page).press('Enter')
  return card(page, question)
}

test.describe('J1: first run without a key (F-SHELL-02, F-AI-03)', () => {
  test('sample data → suggested question → answer with SQL and explanation', async ({ page }) => {
    await page.goto('/app/')
    await expect(page.getByRole('heading', { name: 'Ask your data anything' })).toBeVisible()
    await expect(page.getByText('Your files never leave this browser.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Demo', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Try sample data (1M rows)' }).click()
    const suggestions = page.getByRole('list', { name: 'Suggested questions' })
    await expect(suggestions).toBeVisible({ timeout: 60_000 })
    await suggestions.getByRole('button', { name: 'Which region grew fastest?' }).click()

    const answer = card(page, 'Which region grew fastest?')
    await expect(
      answer.getByRole('heading', { name: 'Revenue growth by region, 2022 to 2025' }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(answer.getByText(/^APAC leads with \+\d+%, followed by LATAM/)).toBeVisible()
    await expect(answer.getByText('Demo', { exact: true })).toBeVisible()

    const timeline = answer.getByRole('list', { name: 'Progress' })
    for (const stage of [
      'Reading schema',
      'Writing SQL',
      'Checking SQL',
      'Running',
      'Summarizing',
    ]) {
      await expect(timeline).toContainText(stage)
    }

    // Chart first (F-ASK-08, F-VIZ-01), with the reason for it (F-EXPL-03).
    await expect(answer.getByRole('tab', { name: 'Chart', selected: true })).toBeVisible()
    await expect(
      answer.getByRole('img', {
        name: /^Bar chart: Revenue growth by region, 2022 to 2025\. 5 categories\. Highest APAC/,
      }),
    ).toBeVisible()
    await expect(answer).toContainText('Why this chart: The AI suggested a bar chart, and it fits')
    await expect(timeline).toContainText('Choosing chart')

    await answer.getByRole('tab', { name: 'Table' }).click()
    const grid = answer.getByRole('grid', { name: 'Result: Which region grew fastest?' })
    await expect(grid.getByRole('gridcell', { name: 'APAC' })).toBeVisible()
    await expect(answer.getByText('5 rows · 4 columns')).toBeVisible()

    await answer.getByRole('tab', { name: 'SQL' }).click()
    await expect(answer.getByLabel('SQL query')).toContainText('FROM')
    await expect(answer.getByLabel('SQL query')).toContainText('global_sales')

    await answer.getByRole('tab', { name: 'Explanation' }).click()
    await expect(answer).toContainText('Assumptions')
    await expect(answer).toContainText('Why this chart')
    await expect(answer).toContainText('2022')
    await answer.getByRole('button', { name: 'region', exact: true }).click()

    await answer.getByRole('tab', { name: 'Trace' }).click()
    await expect(answer).toContainText('guard · attempt 1')
  })

  test('an unknown question offers the demo questions and an API key', async ({ page }) => {
    await loadSales(page)
    const answer = await ask(page, 'What is the meaning of life?')

    await expect(answer.getByRole('alert')).toContainText('Demo mode only knows a few questions')
    await expect(
      answer.getByRole('button', { name: 'Add an API key to ask anything' }),
    ).toBeVisible()
    await answer.getByRole('button', { name: 'What is total revenue by year?' }).click()

    await expect(
      card(page, 'What is total revenue by year?').getByRole('img', { name: /^Bar chart/ }),
    ).toBeVisible()
  })

  test('without the sample loaded, demo mode says what to load', async ({ page }) => {
    await page.goto('/app/')
    await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
    await page.getByRole('menuitem', { name: /HR attrition/ }).click()
    await expect(page.getByRole('region', { name: 'HR attrition (CSV)' })).toBeVisible()

    const answer = await ask(page, 'Which region grew fastest?')
    await expect(answer.getByRole('alert')).toContainText('Demo answers work on the Global Sales')
    await expect(
      answer.getByRole('button', { name: 'Add an API key to ask anything' }),
    ).toBeVisible()
    await answer.getByRole('button', { name: 'Load Global Sales (1M rows)' }).click()
    await expect(page.getByRole('region', { name: 'Global Sales · 1M rows' })).toBeVisible({
      timeout: 60_000,
    })
  })
})

test.describe('table scope (F-ASK-01)', () => {
  test('long table names fit the menu without running under the checks', async ({ page }) => {
    await page.goto('/app/')
    const csv = (name: string) => ({
      name: `${name}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from('order_id,amount\n1,10\n'),
    })
    const tables = ['t_90days_exchange_orders', 't_90days_return_orders', 't_90days_normal_orders']
    await page.getByTestId('file-input').first().setInputFiles(tables.map(csv))
    for (const table of tables) {
      await expect(page.getByRole('region', { name: `${table}.csv` })).toBeVisible()
    }

    await page.getByRole('button', { name: 'Ask about: All tables' }).click()
    for (const table of tables) {
      const item = page.getByRole('menuitemcheckbox', { name: table })
      await expect(item).toBeChecked()
      // The whole name shows, and ends before the check mark starts.
      const name = item.getByText(table, { exact: true })
      expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      const nameBox = await name.boundingBox()
      const checkBox = await item.locator('svg').boundingBox()
      expect((nameBox?.x ?? 0) + (nameBox?.width ?? 0)).toBeLessThanOrEqual(checkBox?.x ?? 0)
    }

    await page.getByRole('menuitemcheckbox', { name: 't_90days_normal_orders' }).click()
    await page.getByRole('menuitemcheckbox', { name: 't_90days_return_orders' }).click()
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('button', { name: 'Ask about: t_90days_exchange_orders' }),
    ).toBeVisible()
  })
})

test.describe('answers (F-ASK-08, F-EXPL-01)', () => {
  test('edited SQL goes through the guard and marks the answer edited', async ({ page }) => {
    await loadSales(page)
    const answer = await ask(page, 'What is total revenue by year?')
    await expect(answer.getByRole('tab', { name: 'Chart' })).toBeVisible()
    await answer.getByRole('tab', { name: 'SQL' }).click()
    const editor = answer.getByLabel('SQL query')

    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('DROP TABLE global_sales')
    await answer.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(answer.getByRole('alert')).toContainText('The query was blocked')

    await editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('SELECT channel, count(*) AS orders FROM global_sales GROUP BY ALL')
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(answer.getByText('Edited', { exact: true }).first()).toBeVisible()
    await answer.getByRole('tab', { name: 'Table' }).click()
    await expect(answer.getByRole('columnheader', { name: /orders/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible()
  })

  test('/ focuses the ask box; Shift+Enter adds a line; answers can be removed', async ({
    page,
  }) => {
    await loadSales(page)
    await page.getByText('Ask a question about your data').click()
    await page.keyboard.press('/')
    await expect(composer(page)).toBeFocused()
    await page.keyboard.type('first line')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('second line')
    await expect(composer(page)).toHaveValue('first line\nsecond line')

    await composer(page).fill('What is total revenue by year?')
    await composer(page).press('Enter')
    const answer = card(page, 'What is total revenue by year?')
    await expect(answer.getByRole('tab', { name: 'Chart' })).toBeVisible()
    await expect(composer(page)).toHaveValue('')
    await answer.getByRole('button', { name: 'Remove answer' }).click()
    await expect(answer).toBeHidden()
  })
})

test('the answer card follows the window when it narrows (tablets, split screen)', async ({
  page,
}) => {
  await loadSales(page)
  const answer = await ask(page, 'Which region grew fastest?')
  const chart = answer.getByRole('img', { name: /^Bar chart/ })
  await expect(chart).toBeVisible({ timeout: 30_000 })
  const width = async (locator: ReturnType<Page['locator']>) =>
    (await locator.boundingBox())?.width ?? Number.POSITIVE_INFINITY

  // The chart and the grid are sized in pixels; they used to hold the card at its first width.
  await page.setViewportSize({ width: 420, height: 900 })
  await expect.poll(() => width(answer)).toBeLessThanOrEqual(420)
  await expect.poll(() => width(chart)).toBeLessThan(await width(answer))
  await answer.getByRole('tab', { name: 'Table' }).click()
  const grid = answer.getByRole('grid')
  await expect(grid).toBeVisible()
  expect(await width(grid)).toBeLessThan(await width(answer))
  expect(
    await page.evaluate(() => document.querySelector('article')?.closest('section')?.scrollWidth),
  ).toBeLessThanOrEqual(420)

  await page.setViewportSize({ width: 1280, height: 900 })
  await answer.getByRole('tab', { name: 'Chart' }).click()
  await expect.poll(() => width(chart)).toBeGreaterThan(600)
})

test.describe('history (F-EXPL-05, F-EXP-02)', () => {
  test('lists questions and queries, re-runs them and survives a reload', async ({ page }) => {
    await loadSales(page)
    const answer = await ask(page, 'What is total revenue by year?')
    await expect(answer.getByRole('tab', { name: 'Chart' })).toBeVisible()

    await page.getByRole('button', { name: 'Side panel' }).click()
    const panel = page.getByRole('complementary', { name: 'Side panel' })
    await panel.getByRole('tab', { name: 'History' }).click()
    const history = panel.getByRole('list', { name: 'History' })
    await expect(history.getByRole('listitem')).toHaveCount(1)
    await expect(history).toContainText('What is total revenue by year?')
    await expect(history).toContainText('Answered')

    await history.getByRole('button', { name: 'Ask again' }).click()
    await expect(page.getByRole('article', { name: 'What is total revenue by year?' })).toHaveCount(
      2,
    )
    await expect(history.getByRole('listitem')).toHaveCount(2)

    await page.reload()
    await page.getByRole('button', { name: 'Side panel' }).click()
    await panel.getByRole('tab', { name: 'History' }).click()
    await expect(history.getByRole('listitem')).toHaveCount(2)
    await history.getByRole('button', { name: 'Delete from history' }).first().click()
    await expect(history.getByRole('listitem')).toHaveCount(1)
    await panel.getByRole('button', { name: 'Clear all' }).click()
    await expect(panel.getByText('No history yet')).toBeVisible()
  })
})

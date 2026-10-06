import { expect, test, type Page } from '@playwright/test'

// M6 in demo mode (J5): a forecast question gets a Python plan, the code waits for Run, Pyodide
// loads from its pinned CDN (~20 MB the first time), and the result is charted and summarized.

test.setTimeout(240_000)

async function loadSales(page: Page) {
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
    timeout: 60_000,
  })
}

test('J5: forecast with Python, run only after approval (F-PY-01…04)', async ({ page }) => {
  await page.goto('/app/')
  await loadSales(page)
  const question = 'Forecast revenue for the next 3 months'
  await page.getByRole('textbox', { name: 'Ask a question' }).fill(question)
  await page.keyboard.press('Enter')
  const card = page.getByRole('article', { name: question })

  // The code is shown with what it will see; nothing runs yet.
  const panel = card.getByRole('region', { name: 'Python analysis' })
  await expect(panel).toContainText('network access turned off')
  await expect(card.getByLabel('Python code')).toContainText('np.polyfit')
  await expect(card.getByRole('tab', { name: 'Input data' })).toBeVisible()

  await panel.getByRole('button', { name: 'Run Python' }).click()
  await expect(card.getByRole('img', { name: /^Line chart: Revenue forecast/ })).toBeVisible({
    timeout: 180_000,
  })
  await expect(card).toContainText(/Revenue is forecast at [\d.,]+M over the next 3 months/)
  await expect(card).toContainText('Summary from the Python code')
  await expect(card.getByRole('list', { name: 'Progress' })).toContainText('Running Python')

  await card.getByRole('tab', { name: 'Table' }).click()
  await expect(card.getByText('51 rows · 3 columns')).toBeVisible()

  // The Python tab keeps the code and its printed output.
  await card.getByRole('tab', { name: 'Python' }).click()
  await card.getByText('Output (print)').click()
  await expect(card).toContainText(/Trend: \+/)
})

test('notebook cells share a session and show matplotlib figures (F-PY-06)', async ({ page }) => {
  await page.goto('/app/')
  await loadSales(page)
  await page.getByRole('tablist', { name: 'Views' }).getByRole('tab', { name: 'SQL' }).click()
  await page.getByRole('tab', { name: 'Python notebook' }).click()
  await page.getByRole('combobox', { name: 'Load df from' }).click()
  await page.getByRole('option', { name: 'global_sales' }).click()
  await page.getByRole('button', { name: 'Load into df' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'df:' })).toHaveText(
    'df: 10,000 rows from global_sales',
    { timeout: 180_000 },
  )

  const first = page.getByRole('region', { name: 'Cell 1', exact: true })
  await first.getByRole('button', { name: 'Run' }).click()
  const firstOutput = page.getByRole('region', { name: 'Output of cell 1' })
  await expect(firstOutput.getByRole('table')).toContainText('revenue', { timeout: 120_000 })
  await expect(first).toContainText('[1]')

  await page.getByRole('button', { name: 'Add cell', exact: true }).click()
  const second = page.getByRole('region', { name: 'Cell 2', exact: true })
  await second.getByLabel('Code of cell 2').click()
  await page.keyboard.type(
    'by_region = df.groupby("region").revenue.sum()\nby_region.plot(kind="bar")\nplt.title("Revenue by region")\nlen(by_region)',
  )
  await page.keyboard.press('ControlOrMeta+Enter')
  const secondOutput = page.getByRole('region', { name: 'Output of cell 2' })
  await expect(secondOutput.getByRole('img', { name: 'Figure 1 from cell 2' })).toBeVisible({
    timeout: 120_000,
  })
  await expect(secondOutput).toContainText('5')
})

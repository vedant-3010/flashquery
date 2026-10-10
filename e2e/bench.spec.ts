import { expect, test } from '@playwright/test'
import { signIn } from './app.ts'

// F-PERF-04: the benchmark page runs every measurement and copies a Markdown table.

test.describe('benchmark page', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('measures the budgets on 100k rows and copies the results', async ({ page }) => {
    test.setTimeout(180_000)
    // The benchmark is open to everyone; signed in, its way back reaches Home (D115).
    await signIn(page)
    await page.goto('/app/bench')
    await expect(page.getByRole('heading', { name: 'Benchmark' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Rows' }).click()
    await page.getByRole('option', { name: /100k rows/ }).click()
    await page.getByRole('button', { name: 'Run benchmark' }).click({ timeout: 60_000 })

    const table = page.getByRole('table', { name: 'Benchmark results' })
    await expect(table).toBeVisible({ timeout: 150_000 })
    for (const metric of [
      'DuckDB ready after page load',
      'Generate 100,000-row sample',
      'Aggregation query p95',
      'Chart render (5,000 points)',
      'Grid scroll through 100,000 rows',
      'DuckDB memory',
    ]) {
      await expect(table).toContainText(metric)
    }
    await page.getByRole('button', { name: 'Copy as Markdown' }).click()
    const markdown = await page.evaluate(() => navigator.clipboard.readText())
    expect(markdown).toContain('| Metric | Result | Budget | |')
    expect(markdown).toContain('100,000 rows')

    await page.getByRole('link', { name: 'Back to flashQuery' }).click()
    await expect(page.getByRole('heading', { name: 'What do you want to look at?' })).toBeVisible()
  })
})

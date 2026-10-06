import { expect, test } from '@playwright/test'

// F-PERF-03: "Restart engine" reloads every dataset and restores answers' results and charts.

test('restarting the engine reloads data and restores answers', async ({ page }) => {
  await page.goto('/app/')
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await page.getByRole('textbox', { name: 'Ask a question' }).fill('Which region grew fastest?')
  await page.keyboard.press('Enter')
  const answer = page.getByRole('article', { name: 'Which region grew fastest?' })
  await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 60_000 })

  await page.getByRole('button', { name: /^Engine ready/ }).click()
  await page.getByRole('button', { name: 'Restart engine' }).click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Engine restarted: 1 table reloaded, 1 answer restored.' }),
  ).toBeVisible({ timeout: 60_000 })

  // Re-ingesting and restoring can be slow while other specs run in parallel.
  await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 30_000 })
  await answer.getByRole('tab', { name: 'Table' }).click()
  await expect(answer.getByRole('gridcell', { name: 'APAC' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
    timeout: 30_000,
  })
})

// F-PERF-05: the engine popover shows DuckDB's memory and what uses it.
test('the engine popover shows memory use', async ({ page }) => {
  await page.goto('/app/')
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 100k rows' }).click()
  await expect(page.getByRole('region', { name: 'Global Sales · 100k rows' })).toBeVisible({
    timeout: 60_000,
  })
  await page.getByRole('button', { name: /^Engine ready/ }).click()
  const users = page.getByRole('list', { name: 'Largest memory users' })
  await expect(users).toContainText('Tables')
  await expect(page.getByRole('dialog')).toContainText(/Memory\s*[\d.]+\s*(MB|GB)/)
})

import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

// F-ASK-14: 👎 asks what was wrong and saves an eval case with the corrected SQL; Settings exports
// the cases as JSON Lines in the evals/ format.

test('a 👎 answer becomes an exportable eval case', async ({ page }) => {
  await page.goto('/app/')
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await page.getByRole('textbox', { name: 'Ask a question' }).fill('Which region grew fastest?')
  await page.keyboard.press('Enter')
  const answer = page.getByRole('article', { name: 'Which region grew fastest?' })
  await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 60_000 })

  await answer.getByRole('button', { name: 'Bad answer' }).click()
  const dialog = page.getByRole('dialog', { name: 'What went wrong?' })
  await dialog.getByRole('radio', { name: 'Misunderstood the question' }).check()
  await dialog.getByRole('textbox', { name: 'Details (optional)' }).fill('Wanted 2024 only')
  await dialog
    .getByRole('textbox', { name: 'SQL that gives the right answer' })
    .fill('SELECT region FROM global_sales LIMIT 1')
  await dialog.getByRole('button', { name: 'Save as eval case' }).click()
  await expect(dialog).toBeHidden()
  await expect(answer.getByRole('button', { name: 'Bad answer' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  const download = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Export eval cases (1)' }).click()
  const file = await (await download).path()
  const [line] = (await readFile(file, 'utf8')).split('\n').map((l) => JSON.parse(l))
  expect(line).toMatchObject({
    dataset: 'global_sales',
    question: 'Which region grew fastest?',
    reference_sql: 'SELECT region FROM global_sales LIMIT 1',
    notes: 'Misunderstood the question: Wanted 2024 only',
  })
  expect(line.generated_sql).toContain('global_sales')
})

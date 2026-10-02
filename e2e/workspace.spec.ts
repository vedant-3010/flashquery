import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

// M7 polish: the quick tour (F-SHELL-05), the shortcuts dialog (F-SHELL-06), business notes
// (F-PROF-05), workspace export/import (F-EXP-03) and clearing local data (F-EXP-04).

async function loadSales(page: Page) {
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
    timeout: 60_000,
  })
}

test('the tour shows once; ? lists the shortcuts', async ({ page }) => {
  await page.goto('/')
  await loadSales(page)
  const tour = page.getByRole('region', { name: 'Quick tour' })
  await expect(tour).toContainText('1 of 3')
  await tour.getByRole('button', { name: 'Next' }).click()
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour).toContainText('Build a dashboard')
  await tour.getByRole('button', { name: 'Got it' }).click()
  await expect(tour).toBeHidden()

  await page.waitForTimeout(300) // settings persist after a short debounce
  await page.reload()
  await loadSales(page)
  await expect(page.getByRole('region', { name: 'Answers' })).toBeVisible()
  await expect(tour).toBeHidden()

  await page.locator('body').press('?')
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(shortcuts).toContainText('Focus the ask box')
  await expect(shortcuts).toContainText('Copy the selected grid cells')
})

test('notes come back with the data; the workspace exports, clears and imports', async ({
  page,
}) => {
  await page.goto('/')
  await loadSales(page)
  const sales = page.getByRole('region', { name: 'Global Sales · 10k rows' })
  await sales.getByRole('button', { name: 'Actions for Global Sales · 10k rows' }).click()
  await page.getByRole('menuitem', { name: 'Notes…' }).click()
  const notes = page.getByRole('dialog', { name: 'Notes on Global Sales · 10k rows' })
  await notes.getByRole('textbox', { name: 'About this data' }).fill('Fiscal year starts in April.')
  await notes.getByRole('textbox', { name: 'Unit of revenue' }).fill('USD')
  await notes.getByRole('button', { name: 'Save notes' }).click()
  await expect(sales).toContainText('Notes: Fiscal year starts in April.')

  await page.getByRole('textbox', { name: 'Ask a question' }).fill('Which region grew fastest?')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('article', { name: 'Which region grew fastest?' }).getByRole('img', {
      name: /^Bar chart/,
    }),
  ).toBeVisible({ timeout: 60_000 })

  // Same schema after a reload: the notes come back.
  await page.waitForTimeout(700)
  await page.reload()
  await loadSales(page)
  await expect(sales).toContainText('Notes: Fiscal year starts in April.')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  const download = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Export workspace' }).click()
  const file = await (await download).path()
  const bundle = JSON.parse(await readFile(file, 'utf8'))
  expect(bundle.format).toBe('askdata-workspace')
  expect(bundle.history[0].text).toBe('Which region grew fastest?')
  expect(Object.values(bundle.notes)).toEqual([
    {
      notes: 'Fiscal year starts in April.',
      columns: { revenue: { description: null, unit: 'USD' } },
    },
  ])

  await settings.getByRole('button', { name: 'Clear all local data…' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear everything' }).click()
  await expect(page.getByRole('heading', { name: 'Ask your data anything' })).toBeVisible()
  await loadSales(page)
  await expect(sales).not.toContainText('Notes:')
  // The tour is back too: everything was cleared.
  await expect(page.getByRole('region', { name: 'Quick tour' })).toBeVisible()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByTestId('workspace-import').setInputFiles(file)
  await expect(
    page.getByText(/Imported 0 dashboards, 1 history entries and notes for 1 datasets/),
  ).toBeVisible()
})

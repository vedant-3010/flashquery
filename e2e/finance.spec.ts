import { expect, test } from '@playwright/test'
import { openProject } from './app.ts'

// The finance sample (D117), in demo mode: it loads from the start panel, answers its questions
// without a key (receivables here), suggests its own questions, and builds its own dashboard.

test('J10: an accountant tries the finance sample', async ({ page }) => {
  test.setTimeout(90_000)
  await openProject(page)
  await page
    .getByRole('list', { name: 'Ways to start' })
    .getByRole('button', { name: /Company finances/ })
    .click()
  await expect(page.getByRole('region', { name: 'Company finances' })).toBeVisible({
    timeout: 60_000,
  })

  // Its questions are the suggestions.
  const suggestions = page.getByRole('list', { name: 'Suggested questions' })
  await expect(suggestions).toContainText('How do monthly income and expenses compare?')
  await expect(suggestions).not.toContainText('Which region grew fastest?')

  const composer = page.getByRole('textbox', { name: 'Ask a question' })
  await composer.fill('Which customers owe us the most?')
  await composer.press('Enter')
  const answer = page.getByRole('article', { name: 'Which customers owe us the most?' })
  await expect(answer.getByRole('img', { name: /^Horizontal bar chart/ })).toBeVisible({
    timeout: 30_000,
  })
  await expect(answer).toContainText('Harbor Health Clinics')

  // A sales question isn't answered from the finance sample: it offers what it can answer.
  await composer.fill('Which region grew fastest?')
  await composer.press('Enter')
  const unmatched = page.getByRole('article', { name: 'Which region grew fastest?' })
  await expect(unmatched).toContainText('Demo mode answers a set of example questions')
  await expect(unmatched.getByRole('list', { name: 'Suggested questions' })).toContainText(
    'How old are our unpaid invoices?',
  )

  await page.getByRole('tab', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Generate dashboard' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Generate' }).click()
  const main = page.getByRole('main')
  await expect(main.getByRole('region', { name: 'Owed to us' })).toContainText('3.5M', {
    timeout: 30_000,
  })
  await expect(main.getByRole('region', { name: 'Unpaid invoices by age' })).toBeVisible()
})

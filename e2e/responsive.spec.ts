import { expect, test, type Page } from '@playwright/test'
import { signIn } from './app.ts'
import { mockSupabase } from './supabase.ts'

// Mobile first (D117): phones and tablets never scroll sideways, the bars keep the essentials on
// screen (the project, the views, the account; the rest is under More), and a phone stacks the
// dashboard's tiles, pairing the KPIs.

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
] as const

async function fitsTheScreen(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const size of SIZES) {
  test.describe(`${size.name}, ${size.width} px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('the sign-in pages fit, and keep their promise in view', async ({ page }) => {
      await mockSupabase(page)
      await page.goto('/app/login')
      await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
      await fitsTheScreen(page)
      // The ink panel is for wide screens; its promise shows under the form here.
      await expect(page.getByRole('main').getByText('Share results, not files')).toBeVisible()
      await page.goto('/app/register')
      await expect(
        page.getByRole('heading', { level: 1, name: 'Create your account' }),
      ).toBeVisible()
      await fitsTheScreen(page)
    })

    test('Home and a project keep the account and the project on screen', async ({ page }) => {
      await signIn(page)
      await page.goto('/app/')
      await expect(
        page.getByRole('heading', { name: 'What do you want to look at?' }),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: /^Account:/ })).toBeInViewport()
      await fitsTheScreen(page)

      await page.goto('/app/new')
      await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/, { timeout: 15_000 })
      await expect(page.getByRole('button', { name: /^Project:/ })).toBeInViewport()
      await expect(page.getByRole('tab', { name: 'Dashboard' })).toBeInViewport()
      await expect(page.getByRole('button', { name: /^Account:/ })).toBeInViewport()
      await fitsTheScreen(page)
      if (size.name === 'phone') {
        // Settings, the theme and how it works are under More.
        await page.getByRole('button', { name: 'More', exact: true }).click()
        await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
        await expect(page.getByRole('menu', { name: 'More' })).toContainText('Privacy: Balanced')
      } else {
        await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
      }
    })

    test('an answer and its dashboard fit; a phone stacks the tiles', async ({ page }) => {
      test.setTimeout(90_000)
      await mockSupabase(page) // a guest, on the finance try link
      await page.goto('/app/try?sample=company-finances')
      const answer = page.getByRole('article', {
        name: 'How do monthly income and expenses compare?',
      })
      await expect(answer.getByRole('img', { name: /^Line chart/ })).toBeVisible({
        timeout: 60_000,
      })
      await fitsTheScreen(page)

      await page.getByRole('tab', { name: 'Dashboard' }).click()
      if (size.name === 'phone') {
        await page.getByRole('button', { name: 'More dashboard actions' }).click()
        await page.getByRole('menuitem', { name: 'Generate dashboard' }).click()
      } else {
        await page.getByRole('button', { name: 'Generate dashboard' }).first().click()
      }
      const dialog = page.getByRole('dialog', { name: 'Generate a dashboard' })
      await dialog.getByRole('button', { name: 'Generate' }).click()
      const income = page.getByRole('main').getByRole('region', { name: 'Income, 2025' })
      const expenses = page.getByRole('main').getByRole('region', { name: 'Expenses, 2025' })
      const chart = page
        .getByRole('main')
        .getByRole('region', { name: 'Income and expenses by month' })
      await expect(chart).toBeVisible({ timeout: 30_000 })
      await fitsTheScreen(page)

      const [a, b, c] = await Promise.all(
        [income, expenses, chart].map((tile) => tile.boundingBox()),
      )
      if (size.name === 'phone') {
        // Two KPIs to a row, then the chart across the full width below them.
        expect(a?.y).toBe(b?.y)
        expect((c?.y ?? 0) > (a?.y ?? 0)).toBe(true)
        expect(c?.width ?? 0).toBeGreaterThan(size.width - 60)
      } else {
        // The grid: four KPIs across the top.
        expect(a?.y).toBe(b?.y)
        expect((b?.x ?? 0) > (a?.x ?? 0)).toBe(true)
      }
    })
  })
}

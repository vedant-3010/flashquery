import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __darkBeforeBody?: boolean
  }
}

test.describe('app shell (F-SHELL-01)', () => {
  test('docks the sidebar at 1280 px and wider', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 800 })
    await page.goto('/')

    await expect(page.getByRole('complementary', { name: 'Datasets' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show datasets' })).toBeHidden()
  })

  test('collapses the sidebar below 1280 px and stays usable at 1024 px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/')

    await expect(page.getByRole('complementary', { name: 'Datasets' })).toBeHidden()
    await page.getByRole('button', { name: 'Side panel' }).click()
    await expect(page.getByRole('complementary', { name: 'Side panel' })).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Show datasets' }).click()
    const overlay = page.getByRole('dialog', { name: 'Datasets' })
    await expect(overlay).toBeVisible()
    await expect(overlay.getByText('No datasets yet')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(overlay).toBeHidden()

    await page.getByRole('button', { name: 'Show datasets' }).click()
    await overlay.getByRole('button', { name: 'Close datasets' }).click()
    await expect(overlay).toBeHidden()
  })

  test('switches between workspace and dashboard', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Ask your data anything' })).toBeVisible()
    await page.getByRole('tab', { name: 'Dashboard' }).click()
    await expect(page.getByText('No tiles yet')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ask your data anything' })).toBeHidden()
  })

  test('toggles the side panel and its tabs', async ({ page }) => {
    await page.goto('/')
    const panel = page.getByRole('complementary', { name: 'Side panel' })

    await expect(panel).toBeHidden()
    await page.getByRole('button', { name: 'Side panel' }).click()
    await panel.getByRole('tab', { name: 'AI inspector' }).click()
    await expect(panel.getByText('No AI requests yet')).toBeVisible()
    await panel.getByRole('button', { name: 'Close side panel' }).click()
    await expect(panel).toBeHidden()
  })
})

test.describe('theme (F-SHELL-04)', () => {
  test('persists the choice and applies it before first paint', async ({ page }) => {
    // Records the theme at the moment <body> is parsed, i.e. before anything can paint.
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        if (!document.body) return
        window.__darkBeforeBody = document.documentElement.classList.contains('dark')
        observer.disconnect()
      }).observe(document, { childList: true, subtree: true })
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveClass(/dark/)

    await page.getByRole('button', { name: 'Theme' }).click()
    await page.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.reload()
    expect(await page.evaluate(() => window.__darkBeforeBody)).toBe(true)
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('follows the OS in system mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})

import { expect, test } from '@playwright/test'
import { openProject } from './app.ts'

declare global {
  interface Window {
    __darkBeforeBody?: boolean
  }
}

test.describe('app shell (F-SHELL-01)', () => {
  test('docks the sidebar at 1280 px and wider', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 800 })
    await openProject(page)

    await expect(page.getByRole('complementary', { name: 'Datasets' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show datasets' })).toBeHidden()
  })

  test('collapses the sidebar below 1280 px and stays usable at 1024 px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await openProject(page)

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
    await openProject(page)

    await expect(page.getByRole('heading', { name: 'Ask your data anything' })).toBeVisible()
    await page.getByRole('tab', { name: 'Dashboard' }).click()
    await expect(page.getByText('No tiles yet')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ask your data anything' })).toBeHidden()
  })

  test('toggles the side panel and its tabs', async ({ page }) => {
    await openProject(page)
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
    await openProject(page)
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
    await openProject(page)
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})

test.describe('how it works (F-SHIP-04)', () => {
  test('explains the privacy modes and opens the AI inspector', async ({ page }) => {
    await openProject(page)
    await page.getByRole('button', { name: 'How flashQuery works' }).click()
    const dialog = page.getByRole('dialog', { name: 'How flashQuery works' })
    const modes = dialog.getByRole('table', { name: 'What the AI receives in each privacy mode' })
    await expect(modes.getByRole('rowheader', { name: /Balanced/ })).toContainText('(yours)')
    await expect(modes).toContainText('No values, no results.')
    await expect(dialog).toContainText('Demo mode sends nothing')

    await dialog.getByRole('button', { name: 'Open the AI inspector' }).click()
    await expect(dialog).toBeHidden()
    const panel = page.getByRole('complementary', { name: 'Side panel' })
    await expect(panel.getByRole('tab', { name: 'AI inspector' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(panel).toContainText('No AI requests yet')
  })
})

test.describe('command palette (F-SHELL-07)', () => {
  test('goes anywhere, loads data and asks questions from the keyboard', async ({ page }) => {
    await openProject(page)
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    const search = palette.getByRole('combobox', { name: 'Search commands' })

    await page.keyboard.press('ControlOrMeta+k')
    await search.fill('global sales 10k')
    await expect(palette.getByRole('option').first()).toHaveText(
      /Load sample: Global Sales · 10k rows/,
    )
    await page.keyboard.press('Enter')
    await expect(palette).toBeHidden()
    await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
      timeout: 60_000,
    })

    await page.keyboard.press('ControlOrMeta+k')
    await search.fill('fastest')
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('article', { name: 'Which region grew fastest?' }).getByRole('img', {
        name: /^Bar chart/,
      }),
    ).toBeVisible({ timeout: 60_000 })

    await page.keyboard.press('ControlOrMeta+k')
    await search.fill('go to sql')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('tablist', { name: 'Views' }).getByRole('tab', { name: 'SQL' }),
    ).toHaveAttribute('aria-selected', 'true')
  })
})

import { expect, test, type Page } from '@playwright/test'

// The landing page at / (PRD D99): renders cleanly, the hero film behaves (pause, reduced motion),
// the privacy toggle shows what each mode sends, it works by keyboard and on a phone, it doesn't
// shift or block, and "Try it on 1M rows" lands on a real answer in the app.

declare global {
  interface Window {
    __layoutShift?: number
    __longTasks?: number[]
  }
}

const film = (page: Page) =>
  page.getByRole('figure', { name: /flashQuery answering “Which region grew fastest\?”/ })

test('renders the page without errors and links to the app', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  await page.goto('/')
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Ask your data anything\. It never leaves your browser\./,
    }),
  ).toBeVisible()
  await expect(film(page)).toBeVisible()
  for (const id of ['how', 'privacy', 'performance', 'features', 'faq']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1)
  }
  await page.getByRole('link', { name: 'Open the app' }).first().click()
  await expect(page).toHaveURL(/\/app\/$/)
  await expect(page.getByRole('heading', { name: 'Ask your data anything' })).toBeVisible()
  expect(errors).toEqual([])
})

test('the hero film can be paused, and holds still with reduced motion', async ({ page }) => {
  await page.goto('/')
  const figure = film(page)
  await expect(figure.getByText('APAC leads with')).toBeVisible({ timeout: 15_000 })
  await page.mouse.move(5, 5) // hovering pauses it too; keep the pointer away
  await figure.getByRole('button', { name: 'Pause' }).click()
  await page.mouse.move(5, 5)
  const before = await figure.innerText()
  await page.waitForTimeout(900)
  expect(await figure.innerText()).toBe(before)
  await expect(figure.getByRole('button', { name: 'Play', exact: true })).toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(film(page).getByText('APAC leads with')).toBeVisible()
  await expect(film(page).getByRole('button', { name: 'Pause' })).toHaveCount(0)
})

test('the privacy toggle shows what each mode sends', async ({ page }) => {
  await page.goto('/#privacy')
  const section = page.locator('#privacy')
  const payload = section.getByText('<data>').locator('..')
  await expect(payload).toContainText('"sampleRows"')
  await expect(payload).toContainText('"distinct": 1461')
  await section.getByRole('radio', { name: 'Strict' }).click()
  await expect(section.getByRole('radio', { name: 'Strict' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(payload).not.toContainText('"sampleRows"')
  await expect(payload).not.toContainText('"distinct"')
  await expect(payload).toContainText('"description": "Order value after discount"')
  await expect(section).toContainText('No values from your data')
})

test('works by keyboard: skip link, FAQ, focus visible', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  const question = page.getByRole('button', { name: 'Is my file uploaded anywhere?' })
  await question.focus()
  await page.keyboard.press('Enter')
  await expect(question).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('flashQuery has no server.')).toBeVisible()
})

test('fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(film(page)).toBeVisible()
  for (const y of [0, 2000, 4000, 6000, 9000]) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(150)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('button', { name: 'Open the menu' }).click()
  await expect(page.locator('#mobile-menu').getByRole('link', { name: 'Privacy' })).toBeVisible()
})

test('the hero loop neither shifts the layout nor blocks the main thread', async ({ page }) => {
  await page.addInitScript(() => {
    window.__layoutShift = 0
    window.__longTasks = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number
        hadRecentInput: boolean
      })[]) {
        if (!entry.hadRecentInput) window.__layoutShift = (window.__layoutShift ?? 0) + entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks?.push(entry.duration)
    }).observe({ type: 'longtask', buffered: false })
  })
  await page.goto('/')
  await page.waitForTimeout(1500) // fonts and first paint
  await page.evaluate(() => {
    window.__layoutShift = 0
    window.__longTasks = []
  })
  await page.waitForTimeout(9_000) // most of a loop
  const { shift, tasks } = await page.evaluate(() => ({
    shift: window.__layoutShift ?? 0,
    tasks: window.__longTasks ?? [],
  }))
  expect(shift).toBeLessThan(0.05)
  expect(tasks.filter((ms) => ms > 50)).toEqual([])
})

test('“Try it on 1M rows” opens the app on a real answer', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.getByRole('link', { name: 'Try it on 1M rows' }).click()
  await expect(page).toHaveURL(/\/app\/$/)
  await expect(page.getByRole('region', { name: 'Global Sales · 1M rows' })).toBeVisible({
    timeout: 60_000,
  })
  const answer = page.getByRole('article', { name: 'Which region grew fastest?' })
  await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 60_000 })
  await expect(answer).toContainText('APAC')
})

test('the built landing page keeps its Content-Security-Policy', async ({ page }) => {
  test.skip(!process.env.CI, 'The CSP is injected at build time; CI tests the production build.')
  await page.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (event) =>
      (window as unknown as { __csp: string[] }).__csp.push(event.violatedDirective),
    )
  })
  const hosts = new Set<string>()
  page.on('request', (request) => hosts.add(new URL(request.url()).hostname))
  await page.goto('/')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
  for (const y of [1500, 3500, 5500, 7500]) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(400)
  }
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([])
  expect([...hosts]).toEqual(['localhost'])
})

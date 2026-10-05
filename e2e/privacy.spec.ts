import { expect, test } from '@playwright/test'

// §5 Privacy: no requests except the LLM API and the pinned CDNs; F-SEC-06: the production CSP.

declare global {
  interface Window {
    __cspViolations?: string[]
  }
}

const ALLOWED_HOSTS = new Set(['localhost', 'cdn.jsdelivr.net', 'extensions.duckdb.org'])

test('a demo session only talks to this origin and the pinned CDNs', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.hostname)
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await page.getByRole('textbox', { name: 'Ask a question' }).fill('Which region grew fastest?')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 60_000 })
  await page.getByRole('tab', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Generate dashboard' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Generate' }).click()
  await expect(page.getByRole('region', { name: 'Monthly revenue' })).toBeVisible()

  expect([...hosts].filter((host) => !ALLOWED_HOSTS.has(host))).toEqual([])
})

test('the production build enforces its Content-Security-Policy', async ({ page }) => {
  test.skip(!process.env.CI, 'The CSP is injected at build time; CI tests the production build.')
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__cspViolations?.push(`${event.violatedDirective} ${event.blockedURI}`),
    )
  })
  await page.goto('/')
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')
  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain('connect-src')
  // Only named hosts plus this computer (F-AI-06): never every https host.
  const connect = /connect-src ([^;]*)/.exec(policy ?? '')?.[1] ?? ''
  expect(connect.split(/\s+/)).not.toContain('https:')
  expect(connect).toContain('http://localhost:*')

  // The app itself runs without violations: data, a chart, the SQL editor.
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await page.getByRole('textbox', { name: 'Ask a question' }).fill('Which region grew fastest?')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 60_000 })
  await page.getByRole('article').getByRole('tab', { name: 'SQL' }).click()
  await expect(page.getByRole('article').getByLabel('SQL query')).toBeVisible()
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([])

  // Anything else is blocked by the policy itself (no-cors would otherwise succeed).
  const outcome = await page.evaluate(() =>
    fetch('https://example.com/', { mode: 'no-cors' }).then(
      () => 'allowed',
      () => 'blocked',
    ),
  )
  expect(outcome).toBe('blocked')
})

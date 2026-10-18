import { expect, test, type Page } from '@playwright/test'
import { chooseBalanced, signIn } from './app.ts'
import { mockHosted } from './hosted.ts'
import { mockSupabase } from './supabase.ts'

// HushGlance AI (F-PLAN-01…05, M16): a signed-in user asks without a key, through our proxy
// (mocked: the quota rules are pgTAP-tested, the proxy unit-tested), runs out, upgrades through
// Dodo's hosted checkout; Pro, premium models, Strict mode, and the user's own OpenRouter account.

const composer = (page: Page) => page.getByRole('textbox', { name: 'Ask a question' })

async function openSales(page: Page) {
  await page.goto('/app/new')
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
    timeout: 60_000,
  })
}

async function ask(page: Page, question: string) {
  await composer(page).fill(question)
  await composer(page).press('Enter')
  return page.getByRole('article', { name: question })
}

test('J11: no key, 3 free questions with HushGlance AI, then Pro through Dodo', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signIn(page)
  const hosted = await mockHosted(page)
  await openSales(page)

  // Hosted by default, with the meter and a one-time note on what goes where.
  await expect(page.getByRole('button', { name: 'Model: Claude Sonnet 5' })).toBeVisible()
  const meter = page.getByLabel('Hosted questions left')
  await expect(meter).toHaveText('3 free questions left.')
  const notice = page.getByRole('complementary', { name: 'About HushGlance AI' })
  await expect(notice).toContainText('zero data retention')
  await notice.getByRole('button', { name: 'Got it' }).click()
  await expect(notice).toBeHidden()
  // Balanced, to check that a question's summary is part of the same charged question.
  await chooseBalanced(page)

  const first = await ask(page, 'Revenue by region')
  await expect(first.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 30_000 })
  await expect(first).toContainText('Hosted summary from HushGlance AI.')
  await expect(meter).toHaveText('2 free questions left.')

  // The plan and its summary are one question: same id, charged once.
  const [plan, summary] = hosted.calls
  expect(plan?.body.model).toBe('anthropic/claude-sonnet-5')
  expect(summary?.body.model).toBe('anthropic/claude-haiku-4.5')
  expect(summary?.question).toBe(plan?.question)
  expect(hosted.questions.get(plan?.question ?? '')).toBe(1)
  // Who's asking is the session; every request demands zero data retention; nothing else rides along.
  expect(plan?.headers.authorization).toBe('Bearer e2e-access-user-e2e')
  expect(plan?.body.provider).toEqual({
    zdr: true,
    data_collection: 'deny',
    require_parameters: true,
  })
  expect(Object.keys(plan?.headers ?? {}).filter((name) => name.startsWith('x-stainless'))).toEqual(
    [],
  )
  expect(plan?.headers['x-api-key']).toBeUndefined()

  for (const [question, left] of [
    ['Which region sells the most?', '1 free question left.'],
    ['Total revenue per region', 'No free questions left.'],
  ] as const) {
    const answer = await ask(page, question)
    await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 30_000 })
    await expect(meter).toHaveText(left)
  }

  // The fourth: the proxy refuses, and Starter, Pro (or your own key) are offered.
  await ask(page, 'And by channel?')
  const upgrade = page.getByRole('dialog', { name: 'You’ve used your free questions' })
  await expect(upgrade).toBeVisible({ timeout: 30_000 })
  const starter = upgrade.getByRole('region', { name: 'Starter' })
  const pro = upgrade.getByRole('region', { name: 'Pro' })
  await expect(starter).toContainText('$5')
  await expect(starter).toContainText('100 questions a month')
  await expect(pro).toContainText('$12')
  await expect(pro).toContainText('300 questions a month')
  await expect(pro).toContainText('Premium models too')
  // Yearly: two months free.
  await upgrade.getByRole('button', { name: /^Yearly/ }).click()
  await expect(starter).toContainText('$50')
  await expect(pro).toContainText('$120')
  await expect(upgrade.getByRole('button', { name: 'Use your own key' })).toBeVisible()
  await pro.getByRole('button', { name: 'Choose Pro' }).click()
  await expect(page).toHaveURL(hosted.checkoutUrl)
  await expect(page.getByRole('heading', { name: 'Dodo test checkout' })).toBeVisible()
  expect(hosted.checkouts).toEqual([{ plan: 'pro', interval: 'year' }])
})

test('Starter moves up to Pro in place: a prorated plan change, no second checkout', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await signIn(page)
  const hosted = await mockHosted(page, { plan: 'starter' })
  await openSales(page)
  // Starter plans with standard models: a premium one offers Pro only.
  await page.getByRole('button', { name: 'Model: Claude Sonnet 5' }).click()
  await page.getByRole('menuitem', { name: /Claude Opus 5\.5/ }).click()
  const upgrade = page.getByRole('dialog', { name: 'That model is part of Pro' })
  await expect(upgrade.getByRole('region', { name: 'Starter' })).toHaveCount(0)
  await upgrade.getByRole('button', { name: 'Switch to Pro' }).click()
  await expect(page.getByText('You’re on Pro.')).toBeVisible({ timeout: 15_000 })
  await expect(upgrade).toBeHidden()
  expect(hosted.checkouts).toEqual([{ plan: 'pro', interval: 'month' }])
  // Now on Pro: the premium model is there to pick.
  await page.getByRole('button', { name: 'Model: Claude Sonnet 5' }).click()
  await expect(page.getByRole('menuitemradio', { name: /Claude Opus 5\.5/ })).toBeVisible()
})

test('Plan and billing: back from checkout Pro arrives; the portal manages it', async ({
  page,
}) => {
  await signIn(page)
  const hosted = await mockHosted(page, { used: 3 })
  await page.goto('/app/account/billing?checkout=done')
  await expect(page.getByRole('heading', { name: 'Plan and billing' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Setting up your plan')
  // Dodo's webhook lands a moment later.
  hosted.plan = 'pro'
  await expect(page.getByRole('status')).toContainText('You’re on Pro', { timeout: 15_000 })
  await expect(page.getByText('3 of 300 used')).toBeVisible()
  await page.getByRole('button', { name: 'Manage subscription' }).click()
  await expect(page).toHaveURL('https://customer.dodopayments.com/portal/e2e')
  expect(hosted.portals).toBe(1)
})

test('premium models are part of Pro', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page)
  await mockHosted(page)
  await openSales(page)
  await page.getByRole('button', { name: 'Model: Claude Sonnet 5' }).click()
  await page.getByRole('menuitem', { name: /Claude Opus 5\.5/ }).click()
  await expect(page.getByRole('dialog', { name: 'That model is part of Pro' })).toBeVisible()
})

test('on Pro, a premium model uses 5 questions', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page)
  const hosted = await mockHosted(page, { plan: 'pro' })
  await openSales(page)
  await page.getByRole('button', { name: 'Model: Claude Sonnet 5' }).click()
  await page.getByRole('menuitemradio', { name: /Claude Opus 5\.5/ }).click()
  await expect(page.getByRole('button', { name: 'Model: Claude Opus 5.5' })).toBeVisible()
  const answer = await ask(page, 'Revenue by region, carefully')
  await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 30_000 })
  const opus = hosted.calls.find((call) => call.body.model === 'anthropic/claude-opus-5.5')
  expect(hosted.questions.get(opus?.question ?? '')).toBe(5)
  // Pro's meter stays out of the way until it runs low.
  await expect(page.getByLabel('Hosted questions left')).toHaveCount(0)
})

test('hosted AI starts in Strict: no data values, and no result rows for a summary', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await signIn(page)
  const hosted = await mockHosted(page)
  await openSales(page)
  // New users start in Strict (D122): nothing to switch.
  await expect(page.getByRole('button', { name: /^Status: Strict/ })).toBeVisible()

  const answer = await ask(page, 'Revenue by region')
  await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 30_000 })
  expect(hosted.calls).toHaveLength(1)
  const sent = JSON.stringify(hosted.calls[0]?.body.messages)
  expect(sent).not.toContain('sampleRows')
  expect(sent).not.toContain('topValues')
  expect(sent).toContain('global_sales')
})

test('your own OpenRouter account: connect without copying a key, any model, ZDR', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await signIn(page)
  const hosted = await mockHosted(page)
  const sent: { body: Record<string, unknown>; auth: string | undefined }[] = []
  let exchanged: unknown = null
  // OpenRouter's sign-in approves at once and sends the browser back with a code.
  await page.route('https://openrouter.ai/auth?*', (route) => {
    const url = new URL(route.request().url())
    const back = new URL(url.searchParams.get('callback_url') ?? '')
    back.searchParams.set('code', 'or-e2e-code')
    return route.fulfill({ status: 302, headers: { location: back.toString() } })
  })
  await page.route('https://openrouter.ai/api/v1/**', async (route) => {
    const request = route.request()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/auth/keys') {
      exchanged = JSON.parse(request.postData() ?? '{}')
      return route.fulfill({
        headers: cors,
        json: { key: 'sk-or-v1-e2e-connected-key-0123456789' },
      })
    }
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
    sent.push({ body, auth: request.headers().authorization })
    const schema = (body.response_format as { json_schema?: { name?: string } } | undefined)
      ?.json_schema?.name
    const content =
      schema === 'answer_summary'
        ? { headline: 'From your OpenRouter account.', bullets: [], caveats: [] }
        : {
            kind: 'sql',
            title: 'Revenue by region',
            sql: 'SELECT region, sum(revenue) AS total_revenue FROM global_sales GROUP BY ALL ORDER BY total_revenue DESC',
            python: null,
            explanation: 'Adds up revenue for each region.',
            assumptions: [],
            tablesUsed: ['global_sales'],
            columnsUsed: ['global_sales.revenue'],
            clarification: null,
            alternatives: [],
            chartHint: null,
          }
    return route.fulfill({
      headers: cors,
      json: {
        id: 'gen-or',
        object: 'chat.completion',
        created: 0,
        model: String(body.model),
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(content), refusal: null },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      },
    })
  })
  await openSales(page)
  const project = page.url()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('radio', { name: 'Your own key' }).click()
  await dialog.getByRole('combobox', { name: 'Provider' }).click()
  await page.getByRole('option', { name: 'OpenRouter' }).click()
  await dialog.getByRole('button', { name: 'Connect OpenRouter' }).click()

  // Back where they were, connected: the key came from the code and this tab's verifier.
  await expect(page.getByText('OpenRouter connected.')).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(project)
  expect(exchanged).toMatchObject({ code: 'or-e2e-code', code_challenge_method: 'S256' })
  // Leaving for OpenRouter reloaded the page: the sample loads again (files aren't kept here).
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('button', { name: 'Model: anthropic/claude-sonnet-5' })).toBeVisible()

  const answer = await ask(page, 'Revenue by region')
  await expect(answer.getByRole('img', { name: /Bar chart/ })).toBeVisible({ timeout: 30_000 })
  expect(sent[0]?.auth).toBe('Bearer sk-or-v1-e2e-connected-key-0123456789')
  expect(sent[0]?.body.provider).toEqual({
    zdr: true,
    data_collection: 'deny',
    require_parameters: true,
  })
  // The user's own account: HushGlance's quota isn't touched.
  expect(hosted.calls).toEqual([])
})

test('guests are offered 3 free questions next to the demo', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/app/try')
  await expect(page.getByRole('link', { name: 'sign in for 3 free questions' })).toHaveAttribute(
    'href',
    '/app/login',
  )
})

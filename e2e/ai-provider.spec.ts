import { expect, test, type Page, type Route } from '@playwright/test'

// J2 and J6 with a real provider code path (LangChain + the Anthropic SDK in the browser) against a
// mocked https://api.anthropic.com. A live call with a real key stays a manual check.

const KEY = 'sk-ant-api03-e2e-fake-key-0123456789abcdef'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
}

interface Plan {
  title: string
  sql: string
  explanation?: string
}

interface Call {
  body: { system?: { text: string }[]; messages: { role: string; content: unknown }[] }
  headers: Record<string, string>
  raw: string
  /** Text of the last user message. */
  user: string
}

type Reply = { plan: Plan } | { text: string } | { delayMs: number; plan: Plan }

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block: { text?: string }) => block.text ?? '').join('')
      : ''

function sqlPlan({ title, sql, explanation = 'Adds up revenue.' }: Plan) {
  return {
    kind: 'sql',
    title,
    sql,
    python: null,
    explanation,
    assumptions: ['Revenue is the revenue column.'],
    tablesUsed: ['global_sales'],
    columnsUsed: ['global_sales.revenue'],
    clarification: null,
    alternatives: [],
    chartHint: null,
  }
}

const message = (text: string) => ({
  id: 'msg_e2e',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 300,
    output_tokens: 240,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 1500,
  },
})

/** Answers Messages API calls with `reply(call)`; returns every call made. */
async function mockAnthropic(page: Page, reply: (call: Call) => Reply) {
  const calls: Call[] = []
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const raw = request.postData() ?? ''
    const body = JSON.parse(raw) as Call['body']
    const call: Call = {
      body,
      raw,
      headers: request.headers(),
      user: textOf(body.messages.at(-1)?.content),
    }
    calls.push(call)
    const answer = reply(call)
    if ('delayMs' in answer) await new Promise((resolve) => setTimeout(resolve, answer.delayMs))
    const text = 'text' in answer ? answer.text : JSON.stringify(sqlPlan(answer.plan))
    await route
      .fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify(message(text)),
      })
      .catch(() => undefined) // The app cancelled the request meanwhile.
  })
  return calls
}

const TOP_COUNTRIES =
  'SELECT country, round(sum(revenue), 2) AS revenue FROM global_sales GROUP BY ALL ORDER BY revenue DESC LIMIT 5'

function salesAnalyst(call: Call): Reply {
  if (call.user === 'Reply with the word OK.') return { text: 'OK' }
  if (call.user.includes('That SQL failed')) {
    return { plan: { title: 'Top 5 countries by revenue', sql: TOP_COUNTRIES } }
  }
  // The new question comes last; earlier turns are listed above it.
  const question = call.user.split('\n\nQuestion: ').at(-1) ?? ''
  if (question === 'Top 5 countries by revenue') {
    // First attempt uses a column that doesn't exist: the pipeline must self-correct.
    return {
      plan: {
        title: 'Top 5 countries by revenue',
        sql: 'SELECT country, sum(revenu) AS revenue FROM global_sales GROUP BY ALL',
      },
    }
  }
  if (question === 'Now split by channel') {
    return {
      plan: {
        title: 'Revenue by country and channel',
        sql: 'SELECT country, channel, round(sum(revenue), 2) AS revenue FROM global_sales GROUP BY ALL ORDER BY revenue DESC LIMIT 10',
      },
    }
  }
  if (question === 'Take your time') {
    return { delayMs: 8_000, plan: { title: 'Slow', sql: TOP_COUNTRIES } }
  }
  return { plan: { title: 'Revenue', sql: 'SELECT sum(revenue) AS revenue FROM global_sales' } }
}

async function addKey(page: Page, { remember = false } = {}) {
  await page.getByRole('button', { name: 'Settings' }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByLabel('Anthropic API key').fill(KEY)
  if (remember) await dialog.getByRole('checkbox', { name: 'Remember on this device' }).check()
  return dialog
}

async function loadSales(page: Page) {
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
    timeout: 60_000,
  })
}

async function ask(page: Page, question: string) {
  const composer = page.getByRole('textbox', { name: 'Ask a question' })
  await composer.fill(question)
  await composer.press('Enter')
  return page.getByRole('article', { name: question }).last()
}

test.describe('J2: own key (F-AI-01, F-ASK-03…09)', () => {
  test('test connection, self-correction and a follow-up', async ({ page }) => {
    const calls = await mockAnthropic(page, salesAnalyst)
    await page.goto('/')
    const dialog = await addKey(page)
    await dialog.getByRole('button', { name: 'Test connection' }).click()
    await expect(dialog.getByRole('status')).toContainText('Connected')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Demo' })).toBeHidden()

    await loadSales(page)
    const first = await ask(page, 'Top 5 countries by revenue')
    await expect(first.getByRole('heading', { name: 'Top 5 countries by revenue' })).toBeVisible()
    await expect(first.getByRole('grid')).toBeVisible()
    await expect(first.getByText('5 rows · 2 columns')).toBeVisible()
    await expect(first.getByRole('list', { name: 'Progress' })).toContainText('Fixing SQL (2)')
    await expect(first.getByText('Demo', { exact: true })).toBeHidden()

    const plans = calls.filter((call) => call.user !== 'Reply with the word OK.')
    expect(plans).toHaveLength(2)
    expect(plans[0].headers['x-api-key']).toBe(KEY)
    expect(plans[0].raw).not.toContain(KEY)
    expect(textOf(plans[0].body.system)).toContain('<data>')
    expect(plans[1].user).toMatch(/That SQL failed:[\s\S]*revenu/)

    await first.getByRole('tab', { name: 'Trace' }).click()
    await expect(first).toContainText('guard · attempt 2')

    const followUp = await ask(page, 'Now split by channel')
    await expect(followUp.getByRole('grid')).toBeVisible()
    const last = calls.at(-1)
    expect(last?.user).toContain('Earlier in this conversation')
    expect(last?.user).toContain('Question: Top 5 countries by revenue')
    expect(last?.user).toContain(TOP_COUNTRIES)
  })

  test('Esc cancels a running question', async ({ page }) => {
    await mockAnthropic(page, salesAnalyst)
    await page.goto('/')
    await addKey(page)
    await page.keyboard.press('Escape')
    await loadSales(page)

    const answer = await ask(page, 'Take your time')
    await expect(answer.getByRole('list', { name: 'Progress' })).toContainText('Writing SQL')
    await page.keyboard.press('Escape')
    await expect(answer.getByText('Cancelled.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible()
  })

  test('the key is forgotten on reload unless "Remember on this device" is on', async ({
    page,
  }) => {
    await page.goto('/')
    await addKey(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Demo' })).toBeHidden()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Demo' })).toBeVisible()

    const dialog = await addKey(page, { remember: true })
    await expect(dialog).toContainText('anyone using this browser profile could read it')
    await page.keyboard.press('Escape')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Demo' })).toBeHidden()
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(dialog.getByLabel('Anthropic API key')).toHaveValue(KEY)

    await dialog.getByRole('checkbox', { name: 'Remember on this device' }).uncheck()
    await page.keyboard.press('Escape')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Demo' })).toBeVisible()
  })
})

test.describe('J6: privacy check (F-AI-02, F-EXPL-04, F-SEC-03, F-SEC-04)', () => {
  test('the inspector shows each payload; Strict sends no data values', async ({ page }) => {
    const calls = await mockAnthropic(page, salesAnalyst)
    await page.goto('/')
    await addKey(page)
    await page.keyboard.press('Escape')
    await loadSales(page)

    await expect((await ask(page, 'Total revenue')).getByRole('grid')).toBeVisible()
    const balanced = calls.at(-1)
    expect(balanced?.raw).toContain('topValues')
    expect(balanced?.raw).toContain('sampleRows')

    await page.getByRole('button', { name: 'Side panel' }).click()
    const panel = page.getByRole('complementary', { name: 'Side panel' })
    await panel.getByRole('tab', { name: 'AI inspector' }).click()
    const requests = panel.getByRole('list', { name: 'AI requests' })
    await expect(requests.getByRole('listitem')).toHaveCount(1)
    await expect(requests).toContainText('Balanced')
    await expect(requests).toContainText(/[1-9][\d,]* data values sent/)
    await expect(requests).toContainText('1,800 in · 240 out · 1,500 cached')
    await requests.getByRole('button', { name: /Write SQL/ }).click()
    await expect(requests.getByRole('region', { name: 'Message 2: system' })).toContainText(
      'sampleRows',
    )
    await expect(requests.getByRole('region', { name: 'Response' })).toContainText(
      'SELECT sum(revenue)',
    )
    await expect(panel).not.toContainText(KEY)

    await page.getByRole('button', { name: 'Privacy mode: Balanced' }).click()
    await page.getByRole('radio', { name: /Strict/ }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Privacy mode: Strict' })).toBeVisible()

    await expect((await ask(page, 'Total revenue again')).getByRole('grid')).toBeVisible()
    const strict = calls.at(-1)
    for (const field of ['topValues', 'sampleRows', 'nullPct', '"min"', 'APAC']) {
      expect(strict?.raw).not.toContain(field)
    }
    await expect(requests.getByRole('listitem')).toHaveCount(2)
    await expect(requests.getByRole('listitem').first()).toContainText('Strict')
    await expect(requests.getByRole('listitem').first()).toContainText('0 data values sent')
  })
})

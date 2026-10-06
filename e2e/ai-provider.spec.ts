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
  kind?: 'sql' | 'explore'
}

interface Call {
  body: { system?: string | { text: string }[]; messages: { role: string; content: unknown }[] }
  headers: Record<string, string>
  raw: string
  /** Text of the last user message. */
  user: string
}

interface Summary {
  headline: string
  bullets: string[]
  caveats: string[]
}

type Reply =
  | { plan: Plan }
  | { text: string }
  | { delayMs: number; plan: Plan }
  | { summary: Summary }
  | { questions: string[] }

const textOf = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((block: { text?: string }) => block.text ?? '').join('')
      : ''

function sqlPlan({ title, sql, explanation = 'Adds up revenue.', kind = 'sql' }: Plan) {
  return {
    kind,
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
    const text =
      'text' in answer
        ? answer.text
        : 'summary' in answer
          ? JSON.stringify(answer.summary)
          : 'questions' in answer
            ? JSON.stringify({ questions: answer.questions })
            : JSON.stringify(sqlPlan(answer.plan))
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

/** Which request this is: the connection test, a summary (F-ASK-12), suggestions or a SQL plan. */
function kindOf(call: Call): 'test' | 'summary' | 'suggest' | 'plan' {
  if (call.user === 'Reply with the word OK.') return 'test'
  const system = textOf(call.body.system)
  if (system.includes('Suggest questions')) return 'suggest'
  return system.includes('short summary') ? 'summary' : 'plan'
}
const plansOf = (calls: Call[]) => calls.filter((call) => kindOf(call) === 'plan')
const summariesOf = (calls: Call[]) => calls.filter((call) => kindOf(call) === 'summary')

const AI_HEADLINE = 'Revenue is concentrated in a handful of countries.'
const AI_QUESTIONS = [
  'Which country buys the most laptops?',
  'How did APAC revenue change by year?',
]

function salesAnalyst(call: Call): Reply {
  if (kindOf(call) === 'test') return { text: 'OK' }
  if (kindOf(call) === 'suggest') return { questions: AI_QUESTIONS }
  if (kindOf(call) === 'summary') {
    return { summary: { headline: AI_HEADLINE, bullets: ['From the AI.'], caveats: [] } }
  }
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

/**
 * Waits until IndexedDB holds the settings with `remembered` (true: the key is saved too). Saving is
 * async, so reloading right after a change would race it.
 */
async function settingsSaved(page: Page, remembered: boolean) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string | null>((resolve) => {
            const open = indexedDB.open('flashQuery')
            open.onerror = () => resolve(null)
            open.onsuccess = () => {
              const db = open.result
              try {
                const request = db.transaction('records').objectStore('records').get('settings')
                request.onsuccess = () => {
                  const data = request.result?.data
                  resolve(data ? `${data.rememberKey}:${data.apiKeys?.anthropic !== null}` : null)
                  db.close()
                }
                request.onerror = () => resolve(null)
              } catch {
                db.close()
                resolve(null)
              }
            }
          }),
      ),
    )
    .toBe(remembered ? 'true:true' : 'false:false')
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
    await page.goto('/app/')
    const dialog = await addKey(page)
    await dialog.getByRole('button', { name: 'Test connection' }).click()
    await expect(dialog.getByRole('status')).toContainText('Connected')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Demo' })).toBeHidden()

    await loadSales(page)
    const first = await ask(page, 'Top 5 countries by revenue')
    await expect(first.getByRole('heading', { name: 'Top 5 countries by revenue' })).toBeVisible()
    await expect(first.getByRole('img', { name: /^Bar chart/ })).toBeVisible()
    await first.getByRole('tab', { name: 'Table' }).click()
    await expect(first.getByText('5 rows · 2 columns')).toBeVisible()
    await expect(first.getByRole('list', { name: 'Progress' })).toContainText('Fixing SQL (2)')
    await expect(first.getByText('Demo', { exact: true })).toBeHidden()

    const plans = plansOf(calls)
    expect(plans).toHaveLength(2)
    expect(plans[0].headers['x-api-key']).toBe(KEY)
    expect(plans[0].raw).not.toContain(KEY)
    expect(textOf(plans[0].body.system)).toContain('<data>')
    expect(plans[1].user).toMatch(/That SQL failed:[\s\S]*revenu/)

    await first.getByRole('tab', { name: 'Trace' }).click()
    await expect(first).toContainText('guard · attempt 2')

    const followUp = await ask(page, 'Now split by channel')
    await expect(followUp.getByRole('tab', { name: 'Chart' })).toBeVisible()
    const last = plansOf(calls).at(-1)
    expect(last?.user).toContain('Earlier in this conversation')
    expect(last?.user).toContain('Question: Top 5 countries by revenue')
    expect(last?.user).toContain(TOP_COUNTRIES)
  })

  test('Esc cancels a running question', async ({ page }) => {
    await mockAnthropic(page, salesAnalyst)
    await page.goto('/app/')
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
    await page.goto('/app/')
    await addKey(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Demo' })).toBeHidden()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Demo' })).toBeVisible()

    const dialog = await addKey(page, { remember: true })
    await expect(dialog).toContainText('anyone using this browser profile could read it')
    await page.keyboard.press('Escape')
    await settingsSaved(page, true)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Demo' })).toBeHidden()
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(dialog.getByLabel('Anthropic API key')).toHaveValue(KEY)

    await dialog.getByRole('checkbox', { name: 'Remember on this device' }).uncheck()
    await page.keyboard.press('Escape')
    await settingsSaved(page, false)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Demo' })).toBeVisible()
  })
})

test.describe('AI summary (F-ASK-12)', () => {
  test('replaces the local summary in Balanced mode, from the result rows', async ({ page }) => {
    const calls = await mockAnthropic(page, salesAnalyst)
    await page.goto('/app/')
    await addKey(page)
    await page.keyboard.press('Escape')
    await loadSales(page)

    const answer = await ask(page, 'Revenue by country and channel')
    await expect(answer.getByText(AI_HEADLINE)).toBeVisible()
    await expect(answer.getByText('Summary by Claude Haiku 4.5, from the result')).toBeVisible()
    await expect(answer.getByRole('list', { name: 'Progress' })).toContainText('Writing summary')

    const [summary] = summariesOf(calls)
    expect(summary?.raw).toContain('"model":"claude-haiku-4-5-20251001"')
    expect(summary?.user).toContain('Question: Revenue by country and channel')
    expect(summary?.user).toMatch(/<data>\n\{"rowCount":1,/)
    expect(summary?.raw).not.toContain(KEY)

    await page.getByRole('button', { name: 'Side panel' }).click()
    await page.getByRole('tab', { name: 'AI inspector' }).click()
    const requests = page.getByRole('list', { name: 'AI requests' })
    await expect(requests.getByRole('listitem').first()).toContainText('Summarize')
    await expect(requests.getByRole('listitem').first()).toContainText('claude-haiku-4-5-20251001')
  })
})

test.describe('J6: privacy check (F-AI-02, F-EXPL-04, F-SEC-03, F-SEC-04)', () => {
  test('the inspector shows each payload; Strict sends no data values', async ({ page }) => {
    const calls = await mockAnthropic(page, salesAnalyst)
    await page.goto('/app/')
    await addKey(page)
    await page.keyboard.press('Escape')
    await loadSales(page)

    const total = await ask(page, 'Total revenue')
    await expect(total.getByRole('tab', { name: 'Chart' })).toBeVisible()
    // Usage meter (F-AI-04): the plan and the summary, 1,800 + 240 tokens each.
    await expect(total.getByText(/^AI usage: 4,080 tokens · ≈ \$0\.0\d+$/)).toBeVisible()
    const balanced = plansOf(calls).at(-1)
    expect(balanced?.raw).toContain('topValues')
    expect(balanced?.raw).toContain('sampleRows')

    await page.getByRole('button', { name: 'Side panel' }).click()
    const panel = page.getByRole('complementary', { name: 'Side panel' })
    await panel.getByRole('tab', { name: 'AI inspector' }).click()
    const requests = panel.getByRole('list', { name: 'AI requests' })
    // The SQL plan, then the AI summary of the result (Balanced, F-ASK-12).
    await expect(requests.getByRole('listitem')).toHaveCount(2)
    await expect(requests).toContainText('Balanced')
    await expect(requests).toContainText(/[1-9][\d,]* data values sent/)
    await expect(requests).toContainText('1,800 in · 240 out · 1,500 cached · ≈ $')
    await expect(panel.getByText(/^Session: 4,080 tokens/)).toBeVisible()
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

    const summariesBefore = summariesOf(calls).length
    const again = await ask(page, 'Total revenue again')
    await expect(again.getByRole('tab', { name: 'Chart' })).toBeVisible()
    const strict = plansOf(calls).at(-1)
    for (const field of ['topValues', 'sampleRows', 'nullPct', '"min"', 'APAC']) {
      expect(strict?.raw).not.toContain(field)
    }
    // Strict: no AI summary, so no result rows leave the device.
    await expect(again.getByText('Summary written on this device')).toBeVisible()
    expect(summariesOf(calls)).toHaveLength(summariesBefore)
    await expect(requests.getByRole('listitem')).toHaveCount(3)
    await expect(requests.getByRole('listitem').first()).toContainText('Strict')
    await expect(requests.getByRole('listitem').first()).toContainText('0 data values sent')
  })

  test('suggests questions with AI on request, cached per schema (F-PROF-04)', async ({ page }) => {
    const calls = await mockAnthropic(page, salesAnalyst)
    const suggestions = () => calls.filter((call) => kindOf(call) === 'suggest')
    await page.goto('/app/')
    await addKey(page, { remember: true })
    await page.keyboard.press('Escape')
    await loadSales(page)

    const chips = page.getByRole('list', { name: 'Suggested questions' })
    await expect(chips.getByRole('button', { name: 'Total revenue by region' })).toBeVisible()
    await chips.getByRole('button', { name: 'Suggest with AI' }).click()
    await expect(chips.getByRole('button', { name: AI_QUESTIONS[0] })).toBeVisible()
    await expect(chips.getByRole('button', { name: 'Suggest with AI' })).toBeHidden()
    expect(suggestions()).toHaveLength(1)
    expect(suggestions()[0]?.user).toContain('<data>')
    expect(suggestions()[0]?.raw).not.toContain(KEY)

    await page.reload()
    await loadSales(page)
    await expect(chips.getByRole('button', { name: AI_QUESTIONS[1] })).toBeVisible()
    expect(suggestions()).toHaveLength(1)
  })
})

test.describe('local OpenAI-compatible server (F-AI-06)', () => {
  /** Answers OpenAI chat completions at Ollama's default address; returns the request bodies. */
  async function mockLocalServer(page: Page) {
    const bodies: string[] = []
    await page.route('http://localhost:11434/v1/**', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
      const raw = request.postData() ?? ''
      bodies.push(raw)
      const body = JSON.parse(raw) as { messages: { content: string }[]; model: string }
      const last = body.messages.at(-1)?.content ?? ''
      const content =
        last === 'Reply with the word OK.'
          ? 'OK'
          : JSON.stringify(
              sqlPlan({
                title: 'Total revenue',
                sql: 'SELECT sum(revenue) AS revenue FROM global_sales',
              }),
            )
      await route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'chatcmpl-e2e',
          object: 'chat.completion',
          created: 0,
          model: body.model,
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 900, completion_tokens: 60, total_tokens: 960 },
        }),
      })
    })
    return bodies
  }

  test('answers through a server on this computer, without a key', async ({ page }) => {
    const bodies = await mockLocalServer(page)
    await page.goto('/app/')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('combobox', { name: 'Provider' }).click()
    await page.getByRole('option', { name: 'Local server (OpenAI-compatible)' }).click()
    await expect(dialog.getByLabel('Server URL')).toHaveValue('http://localhost:11434/v1')
    await expect(dialog.getByLabel('Model')).toHaveValue('qwen2.5-coder:7b')

    // Only this computer: anything else is refused, and the app stays in demo mode.
    await dialog.getByLabel('Server URL').fill('https://api.example.com/v1')
    await expect(dialog.getByRole('alert')).toContainText('Use a server on this computer')
    await dialog.getByRole('button', { name: 'Ollama' }).click()

    await dialog.getByRole('button', { name: 'Test connection' }).click()
    await expect(dialog.getByRole('status')).toContainText('Connected')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Demo' })).toBeHidden()

    await loadSales(page)
    const answer = await ask(page, 'Total revenue')
    await expect(answer.getByRole('heading', { name: 'Total revenue' })).toBeVisible()
    await expect(answer.getByText(/^AI usage: [\d,]+ tokens$/)).toBeVisible()
    const plan = bodies.find((body) => body.includes('Total revenue') && body.includes('<data>'))
    expect(JSON.parse(plan ?? '{}').model).toBe('qwen2.5-coder:7b')
  })
})

test.describe('suggested joins (F-PROF-07)', () => {
  test('finds a join key between uploads, sends it with questions until ignored', async ({
    page,
  }) => {
    const calls = await mockAnthropic(page, (call) =>
      kindOf(call) === 'plan'
        ? { plan: { title: 'Revenue', sql: 'SELECT sum(amount) AS revenue FROM orders' } }
        : salesAnalyst(call),
    )
    await page.goto('/app/')
    await addKey(page)
    await page.keyboard.press('Escape')

    const customers = [
      'id,name',
      ...Array.from({ length: 30 }, (_, i) => `${i + 1},Customer ${i + 1}`),
    ]
    const orders = [
      'order_id,customer_id,amount',
      ...Array.from({ length: 120 }, (_, i) => `${i + 1},${(i % 30) + 1},${(i + 1) * 3}`),
    ]
    await page
      .getByTestId('file-input')
      .first()
      .setInputFiles([
        { name: 'customers.csv', mimeType: 'text/csv', buffer: Buffer.from(customers.join('\n')) },
        { name: 'orders.csv', mimeType: 'text/csv', buffer: Buffer.from(orders.join('\n')) },
      ])
    const joins = page.getByRole('region', { name: 'Suggested joins' })
    await expect(joins).toContainText('orders.customer_id → customers.id', { timeout: 30_000 })
    await expect(joins).toContainText('many to one · 100% of values match')

    await expect((await ask(page, 'Revenue')).getByRole('tab', { name: 'Chart' })).toBeVisible()
    // The data line, not the system prompt's rule about it.
    expect(plansOf(calls).at(-1)?.raw).toContain('{\\"suggestedJoins\\":[')

    await joins
      .getByRole('button', { name: 'Ignore the join orders.customer_id → customers.id' })
      .click()
    await expect(joins).toBeHidden()
    await expect(
      (await ask(page, 'Revenue again')).getByRole('tab', { name: 'Chart' }),
    ).toBeVisible()
    expect(plansOf(calls).at(-1)?.raw).not.toContain('{\\"suggestedJoins\\":[')
  })
})

test.describe('multi-step exploration (F-ASK-15)', () => {
  test('looks at the data first; the exploration is in the timeline and the trace', async ({
    page,
  }) => {
    const calls = await mockAnthropic(page, (call) => {
      if (kindOf(call) !== 'plan') return salesAnalyst(call)
      if (call.user.includes('Exploration 1 returned')) {
        return {
          plan: {
            title: 'Revenue by channel',
            sql: 'SELECT channel, sum(revenue) AS revenue FROM global_sales GROUP BY ALL ORDER BY revenue DESC',
          },
        }
      }
      return {
        plan: {
          kind: 'explore',
          title: 'Checking channels',
          sql: 'SELECT DISTINCT channel FROM global_sales ORDER BY channel',
        },
      }
    })
    await page.goto('/app/')
    await addKey(page)
    await page.keyboard.press('Escape')
    await loadSales(page)

    const answer = await ask(page, 'Revenue for each sales channel')
    await expect(answer.getByRole('heading', { name: 'Revenue by channel' })).toBeVisible()
    await expect(answer.getByRole('list', { name: 'Progress' })).toContainText('Exploring data')
    await answer.getByRole('tab', { name: 'Trace' }).click()
    await expect(answer).toContainText('SELECT DISTINCT channel FROM global_sales')
    const followUp = plansOf(calls).at(-1)?.user ?? ''
    expect(followUp).toContain('Exploration 1 returned 3 rows')
    expect(followUp).toContain('Online')
  })
})

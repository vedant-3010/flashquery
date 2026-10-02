import { expect, test, type Page } from '@playwright/test'

// F-PERF-01: heavy libraries load on first use, not with the landing page. Matches both dev
// module paths and production chunk names (echarts-*.js, CodeEditor-*.js, langchain-*.js, …).

const HEAVY = {
  ECharts: /echarts/i,
  CodeMirror: /codemirror|CodeEditor|SqlEditor/i,
  LangChain: /langchain|providers\/(anthropic|openai)|\/(anthropic|openai)-[\w-]+\.js/i,
  Pyodide: /pyodide|python\.worker/i,
}

function recordRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))
  return urls
}

const loaded = (urls: string[], pattern: RegExp) => urls.some((url) => pattern.test(url))

test('the landing page loads none of the heavy libraries; each loads on first use', async ({
  page,
}) => {
  const urls = recordRequests(page)
  await page.goto('/')
  // DuckDB starts after the first paint, in an idle callback.
  await expect(page.getByRole('button', { name: /^Engine ready/ })).toBeVisible({ timeout: 30_000 })
  for (const [name, pattern] of Object.entries(HEAVY)) {
    expect(loaded(urls, pattern), `${name} loaded with the landing page`).toBe(false)
  }

  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await page.getByRole('textbox', { name: 'Ask a question' }).fill('Which region grew fastest?')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('article', { name: 'Which region grew fastest?' }).getByRole('img', {
      name: /^Bar chart/,
    }),
  ).toBeVisible({ timeout: 60_000 })
  expect(loaded(urls, HEAVY.ECharts)).toBe(true)
  // Demo mode never needs a provider; nothing ran Python.
  expect(loaded(urls, HEAVY.LangChain)).toBe(false)
  expect(loaded(urls, HEAVY.Pyodide)).toBe(false)

  expect(loaded(urls, HEAVY.CodeMirror)).toBe(false)
  await page.getByRole('tablist', { name: 'Views' }).getByRole('tab', { name: 'SQL' }).click()
  await expect(page.getByLabel('SQL query')).toBeVisible()
  expect(loaded(urls, HEAVY.CodeMirror)).toBe(true)
})

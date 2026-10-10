import { expect, test, type Page } from '@playwright/test'
import { openProject, signIn } from './app.ts'

// M12 (F-HOME-01…04): Home, projects with their own data, routes that deep-link, and data saved
// before projects moving into "My first project". Demo mode, no key.

async function loadSales(page: Page) {
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
    timeout: 60_000,
  })
}

async function ask(page: Page, question: string) {
  const box = page.getByRole('textbox', { name: 'Ask a question' })
  await box.fill(question)
  await box.press('Enter')
  const answer = page.getByRole('article', { name: question, exact: true })
  await expect(answer.getByRole('tab', { name: 'Chart' })).toBeVisible({ timeout: 30_000 })
  return answer
}

const goHome = async (page: Page) => {
  await page.getByRole('link', { name: 'flashQuery Home' }).click()
  await expect(page).toHaveURL(/\/app\/$/)
}

const card = (page: Page, name: string) => page.getByRole('article', { name, exact: true })

/** The side panel on its History tab (an empty project shows an empty state, not a list). */
async function historyOf(page: Page) {
  await page.getByRole('button', { name: 'Side panel' }).click()
  const panel = page.getByRole('complementary', { name: 'Side panel' })
  await panel.getByRole('tab', { name: 'History' }).click()
  return panel
}

test('data saved before projects moves into "My first project"', async ({ page }) => {
  await signIn(page)
  // The landing page shares the origin and never opens IndexedDB: seed v1 records from it.
  await page.goto('/')
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('flashQuery')
      open.onupgradeneeded = () => open.result.createObjectStore('records')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const records = db.transaction('records', 'readwrite')
    records.objectStore('records').put(
      {
        version: 1,
        savedAt: Date.now(),
        data: [
          {
            id: 'h_v1',
            kind: 'question',
            text: 'Which region grew fastest?',
            sql: 'SELECT 1',
            status: 'answered',
            headline: 'APAC leads',
            rowCount: 5,
            at: Date.now() - 120_000,
          },
        ],
      },
      'history',
    )
    await new Promise((resolve) => (records.oncomplete = resolve))
    db.close()
  })

  await page.goto('/app/')
  const first = card(page, 'My first project')
  await expect(first).toContainText('1 question')
  const recent = page.getByRole('region', { name: 'Recent questions' })
  await expect(recent).toContainText('Which region grew fastest?')
  await expect(recent).toContainText('My first project')

  await first.getByRole('link', { name: 'My first project' }).click()
  await expect(page).toHaveURL(/\/app\/p\/my-first-project$/)
  await expect(await historyOf(page)).toContainText('Which region grew fastest?')
})

test('each project keeps its own data; switching opens a fresh page', async ({ page }) => {
  await openProject(page)
  await loadSales(page)
  await ask(page, 'Which region grew fastest?')
  const firstUrl = page.url()

  await goHome(page)
  const untitled = card(page, 'Untitled project')
  await expect(untitled).toContainText('Global Sales · 10k rows')
  await expect(untitled).toContainText('1 question')

  // A second project starts empty: no tables or answers carry over.
  await page.getByRole('link', { name: 'New project' }).click()
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/)
  expect(page.url()).not.toBe(firstUrl)
  await expect(page.getByRole('button', { name: 'Project: Untitled project 2' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ask your data anything' })).toBeVisible()
  await expect(await historyOf(page)).not.toContainText('Which region grew fastest?')

  // Rename it from the top bar, then switch back to the first one.
  await page.getByRole('button', { name: 'Project: Untitled project 2' }).click()
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  const rename = page.getByRole('dialog', { name: 'Rename project' })
  await rename.getByRole('textbox', { name: 'Project name' }).fill('Q3 review')
  await rename.getByRole('button', { name: 'Rename' }).click()
  await expect(page.getByRole('button', { name: 'Project: Q3 review' })).toBeVisible()
  await expect(page).toHaveTitle('Q3 review · flashQuery')

  await page.getByRole('button', { name: 'Project: Q3 review' }).click()
  await page.getByRole('menuitem', { name: 'Untitled project' }).click()
  await expect(page).toHaveURL(firstUrl)
  await expect(await historyOf(page)).toContainText('Which region grew fastest?')

  // Delete the second project from Home; its link no longer opens.
  await goHome(page)
  const q3 = card(page, 'Q3 review')
  const q3Url = await q3.getByRole('link', { name: 'Q3 review' }).getAttribute('href')
  await q3.getByRole('button', { name: 'More actions for Q3 review' }).click()
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete project' }).click()
  await expect(page.getByText('Deleted Q3 review.')).toBeVisible()
  await expect(q3).toBeHidden()
  await page.goto(q3Url ?? '/app/missing')
  await expect(page.getByRole('heading', { name: 'Project not found' })).toBeVisible()
})

test('routes deep-link and survive a reload; v1 links redirect', async ({ page }) => {
  await openProject(page)
  const project = page.url()
  await page.getByRole('tablist', { name: 'Views' }).getByRole('tab', { name: 'Dashboard' }).click()
  await expect(page).toHaveURL(`${project}/dashboard`)
  await page.reload()
  await expect(
    page.getByRole('tablist', { name: 'Views' }).getByRole('tab', { name: 'Dashboard' }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.goBack()
  await expect(page).toHaveURL(project)
  await expect(
    page.getByRole('tablist', { name: 'Views' }).getByRole('tab', { name: 'Workspace' }),
  ).toHaveAttribute('aria-selected', 'true')

  await page.goto(`${project}/sql`)
  await expect(page.getByLabel('SQL query')).toBeVisible()

  await page.goto('/app/#/bench')
  await expect(page).toHaveURL(/\/app\/bench$/)
  await expect(page.getByRole('heading', { name: 'Benchmark' })).toBeVisible()
  await page.goto('/app/s/some-link-0123456789abcdef')
  await expect(
    page.getByRole('heading', { name: 'This dashboard is no longer shared' }),
  ).toBeVisible()
  await page.goto('/app/nowhere')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Go to Home' }).click()
  await expect(page).toHaveURL(/\/app\/$/)
})

test('Home asks in the last project, or leaves the question in its box without data', async ({
  page,
}) => {
  await openProject(page)
  await loadSales(page)
  await goHome(page)
  await page
    .getByRole('textbox', { name: 'Ask about Untitled project' })
    .fill('What is total revenue by year?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  const answer = page.getByRole('article', { name: 'What is total revenue by year?' })
  await expect(answer.getByRole('tab', { name: 'Chart' })).toBeVisible({ timeout: 30_000 })

  // A new project has no data yet: the question waits, and the ask box takes it once data loads.
  await page.goto('/app/new')
  await expect(page.getByRole('button', { name: 'Project: Untitled project 2' })).toBeVisible()
  await goHome(page)
  await page.getByRole('textbox', { name: 'Ask about Untitled project 2' }).fill('Revenue by month')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText('Load data to ask “Revenue by month”')).toBeVisible()
  await loadSales(page)
  await expect(page.getByRole('textbox', { name: 'Ask a question' })).toHaveValue(
    'Revenue by month',
  )
})

test('starting from Home: files and a workspace go into new projects', async ({ page }) => {
  // A project is open in this page, so the new one opens after a reload: the file survives it.
  await openProject(page)
  await goHome(page)
  await page.getByTestId('home-file-input').setInputFiles({
    name: 'orders_2025.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('order_id,amount\n1,10\n2,20\n'),
  })
  await expect(page.getByRole('button', { name: 'Project: orders_2025' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'orders_2025.csv' })).toBeVisible({
    timeout: 30_000,
  })

  await goHome(page)
  await page.getByTestId('home-workspace-input').setInputFiles({
    name: 'workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'flashQuery-workspace',
        version: 1,
        exportedAt: Date.now(),
        history: [
          {
            id: 'h_imported',
            kind: 'question',
            text: 'Imported question',
            sql: null,
            status: 'no-sql',
            headline: null,
            rowCount: null,
            at: Date.now(),
          },
        ],
        dashboards: [],
        notes: {},
      }),
    ),
  })
  await expect(page.getByRole('button', { name: 'Project: Imported workspace' })).toBeVisible()
  await expect(page.getByText('Imported 0 dashboards, 1 history entries')).toBeVisible()
  await expect(await historyOf(page)).toContainText('Imported question')
})

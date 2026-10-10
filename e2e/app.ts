import { expect, type Locator, type Page } from '@playwright/test'
import {
  mockSupabase,
  SESSION_KEY,
  sessionFor,
  type MockSupabase,
  type MockUser,
} from './supabase.ts'
import type { MockCloud } from './supabaseSharing.ts'

// Shared e2e steps. Since M12, /app/ is Home; since D115 Home and projects need an account where
// accounts are on (the dev server with .env.local, CI's build): tests sign in to a mocked service.

export const E2E_USER: MockUser = {
  id: 'user-e2e',
  email: 'e2e@example.com',
  password: 'e2e passphrase',
  name: 'E2E Tester',
  provider: 'email',
}

/**
 * Signed in, before the page loads: the mocked service, and a saved session supabase-js restores
 * (put back on every load, so it outlasts "Clear all local data").
 */
export async function signIn(
  page: Page,
  {
    user = E2E_USER,
    others = [],
    cloud,
  }: { user?: MockUser; others?: MockUser[]; cloud?: MockCloud } = {},
): Promise<MockSupabase> {
  const service = await mockSupabase(page, { users: [user, ...others], cloud })
  await page.addInitScript(
    ({ key, session }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(session))
    },
    { key: SESSION_KEY, session: sessionFor(user) },
  )
  return service
}

/** Opens a new, empty project, signed in: the workspace, as `/app/` showed before projects. */
export async function openProject(page: Page): Promise<void> {
  await signIn(page)
  await page.goto('/app/new')
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/, { timeout: 15_000 })
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
}

/**
 * An answer's steps (F-ASK-06): once it settles cleanly they fold into "Answered in …" (D118), so
 * wait for the answer to finish, open them, and return the list.
 */
export async function answerSteps(answer: Locator): Promise<Locator> {
  await expect(answer.getByRole('button', { name: 'Ask again' })).toBeVisible({ timeout: 30_000 })
  // The AI summary can still be writing; the steps fold when it's done. An answer with a warning
  // never folds, so give it a few seconds, then read whichever is there.
  const toggle = answer.getByRole('button', { name: /^Answered in/ })
  await toggle.waitFor({ timeout: 5_000 }).catch(() => undefined)
  if ((await toggle.count()) > 0 && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click()
  }
  return answer.getByRole('list', { name: 'Progress' })
}

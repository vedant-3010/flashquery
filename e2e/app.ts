import { expect, type Page } from '@playwright/test'
import {
  mockSupabase,
  SESSION_KEY,
  sessionFor,
  type MockSupabase,
  type MockUser,
} from './supabase.ts'

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
export async function signIn(page: Page): Promise<MockSupabase> {
  const service = await mockSupabase(page, { users: [E2E_USER] })
  await page.addInitScript(
    ({ key, session }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(session))
    },
    { key: SESSION_KEY, session: sessionFor(E2E_USER) },
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

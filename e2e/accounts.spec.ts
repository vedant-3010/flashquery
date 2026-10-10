import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, SUPABASE_URL } from './supabase.ts'

// M13 accounts (F-ACCT-01…04) against a mocked Supabase: the real supabase-js runs in the browser.

const meera = {
  id: 'user-meera',
  email: 'meera@example.com',
  password: 'correct horse battery',
  name: 'Meera Iyer',
  provider: 'email',
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('sign up with email, sign out, and sign in again (J7)', async ({ page }) => {
  const service = await mockSupabase(page)
  // Home asks for an account first (D115).
  await page.goto('/app/')
  await expect(page).toHaveURL(/\/app\/login$/)
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/app\/register$/)
  await page.getByLabel('Name').fill('Meera Iyer')
  await page.getByLabel('Email').fill('meera@example.com')
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()

  // Signed in on Home: the initials stand for the account.
  await expect(page).toHaveURL(/\/app\/$/)
  const account = page.getByRole('button', { name: 'Account: Meera Iyer' })
  await expect(account).toHaveText('MI')
  expect(service.bodies.get('/auth/v1/signup')).toMatchObject({
    email: 'meera@example.com',
    data: { full_name: 'Meera Iyer' },
  })

  await account.click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/app\/login$/)

  await signIn(page, 'meera@example.com', 'correct horse battery')
  await expect(page.getByRole('button', { name: 'Account: Meera Iyer' })).toBeVisible()
})

test('says what went wrong, and when an email needs confirming', async ({ page }) => {
  await mockSupabase(page, { users: [meera], confirmEmail: true })
  await signIn(page, 'meera@example.com', 'wrong password')
  await expect(page.getByRole('alert')).toContainText('Wrong email or password.')

  await page.goto('/app/register')
  await page.getByLabel('Name').fill('Ravi')
  await page.getByLabel('Email').fill('ravi@example.com')
  await page.getByLabel('Password').fill('long enough password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible()
  await expect(page.getByText('We sent a link to ravi@example.com.')).toBeVisible()
})

test('GitHub sign-in returns signed in (PKCE)', async ({ page }) => {
  const service = await mockSupabase(page, {
    oauthUser: { ...meera, id: 'user-gh', provider: 'github', name: 'Octo Cat' },
  })
  await page.goto('/app/login')
  await page.getByRole('button', { name: 'Continue with GitHub' }).click()
  await expect(page).toHaveURL(/\/app\/$/)
  await expect(page.getByRole('button', { name: 'Account: Octo Cat' })).toBeVisible()
  await expect(page.getByText('Signed in as Octo Cat.')).toBeVisible()
  expect(service.calls.some((call) => call.includes('/auth/v1/authorize?provider=github'))).toBe(
    true,
  )
  expect(service.calls).toContain('POST /auth/v1/token?grant_type=pkce')
})

test('an email link signs in', async ({ page }) => {
  await mockSupabase(page, { users: [meera] })
  await page.goto('/app/login')
  await page.getByRole('button', { name: 'Email me a sign-in link instead' }).click()
  await page.getByLabel('Email').fill('meera@example.com')
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  // The email's link, opened in this browser.
  await page.goto('/app/auth/callback?code=e2e-link-code')
  await expect(page.getByRole('button', { name: 'Account: Meera Iyer' })).toBeVisible()
})

test('a session survives a reload; the account page renames and deletes', async ({ page }) => {
  const service = await mockSupabase(page, { users: [meera] })
  await signIn(page, meera.email, meera.password)
  await expect(page.getByRole('button', { name: 'Account: Meera Iyer' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Account: Meera Iyer' })).toBeVisible()
  // Opened directly, the account page waits for the saved session instead of bouncing to sign-in.
  await page.goto('/app/account')
  await expect(page.getByLabel('Display name')).toHaveValue('Meera Iyer')
  await page.goto('/app/')

  await page.getByRole('button', { name: 'Account: Meera Iyer' }).click()
  await page.getByRole('menuitem', { name: 'Account' }).click()
  await expect(page).toHaveURL(/\/app\/account$/)
  await page.getByLabel('Display name').fill('Meera I.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Name saved.')).toBeVisible()
  expect(service.bodies.get('/rest/v1/profiles')).toEqual({ display_name: 'Meera I.' })

  await page.getByRole('button', { name: 'Delete account…' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete account' }).click()
  await expect(page).toHaveURL(/\/app\/login$/)
  await expect(page.getByText('Your account was deleted.')).toBeVisible()
  expect(service.calls).toContain('POST /rest/v1/rpc/delete_my_account')
  expect(service.users).toEqual([])
})

test('a reset link lets you choose a new password', async ({ page }) => {
  const service = await mockSupabase(page, { users: [meera] })
  await page.goto('/app/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email').fill(meera.email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText(`If ${meera.email} has an account`)).toBeVisible()

  await page.goto('/app/reset?code=e2e-reset-code')
  await page.getByLabel('New password').fill('a brand new passphrase')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Password changed.')).toBeVisible()
  expect(service.bodies.get('/auth/v1/user')).toMatchObject({ password: 'a brand new passphrase' })
})

test('without an account service, nothing asks to sign in', async ({ page }) => {
  test.skip(Boolean(process.env.CI), 'CI builds with the mocked service configured.')
  // Off for this page even when .env.local configures a local service (development builds only).
  await page.addInitScript(() => {
    window.__flashQueryAccounts = { url: '', key: '' }
  })
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/app/')
  await expect(page.getByRole('heading', { name: 'What do you want to look at?' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
  await page.goto('/app/login')
  await expect(page.getByRole('heading', { name: 'Accounts aren’t set up here' })).toBeVisible()
  expect(requests.filter((url) => url.startsWith(SUPABASE_URL))).toEqual([])
})

test('the app asks for an account; the try link and its project stay open (D115)', async ({
  page,
}) => {
  await mockSupabase(page, { users: [meera] })
  // A project's link, signed out: sign in, then back to that page.
  await page.goto('/app/p/some-project/dashboard')
  await expect(page).toHaveURL(/\/app\/login\?next=%2Fp%2Fsome-project%2Fdashboard$/)
  await page.getByLabel('Email').fill(meera.email)
  await page.getByLabel('Password').fill(meera.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/p\/some-project\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Project not found' })).toBeVisible()

  // Signed out, "Try it on 1M rows" still answers, with no account.
  await page.getByRole('link', { name: 'Go to Home' }).click()
  await page.getByRole('button', { name: 'Account: Meera Iyer' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/app\/login$/)
  await page
    .getByRole('link', { name: 'Or try it free with sample data, no account needed' })
    .click()
  await expect(page).toHaveURL(/\/app\/p\/try-global-sales$/)
  const answer = page.getByRole('article', { name: 'Which region grew fastest?' })
  await expect(answer.getByRole('img', { name: /^Bar chart/ })).toBeVisible({ timeout: 60_000 })
  // Its Home link asks for the account again.
  await page.getByRole('link', { name: 'flashQuery Home' }).click()
  await expect(page).toHaveURL(/\/app\/login$/)
})

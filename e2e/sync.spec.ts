import { expect, test, type Browser, type Page } from '@playwright/test'
import { signIn } from './app.ts'
import { mockVault, mockVaultState, type MockVault } from './vault.ts'

// J12 (M17, F-SYNC-01…06): a project, its questions, dashboard and files open on a second device,
// unlocked with the passphrase or the recovery key, and the account service only ever receives
// ciphertext. Two browser contexts are two devices of one account, sharing one mocked service.

const PASSPHRASE = 'correct horse battery staple'
const QUESTION = 'Which region grew fastest?'
const CSV = {
  name: 'customers.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(
    'customer_name,amount_owed\nZanzibar Widgets Ltd,4242.17\nQuokka Supplies,1300.50\n',
  ),
}
/** Plaintext that must never reach the account service. */
const SECRETS = ['Zanzibar Widgets', 'Quokka Supplies', 'amount_owed', QUESTION, 'customers.csv']

async function device(browser: Browser, vault: MockVault): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await signIn(page)
  await mockVault(page, vault)
  return page
}

/** First device: Home offers setup; returns the recovery key it showed. */
async function setUp(page: Page): Promise<string> {
  await page.goto('/app/')
  const dialog = page.getByRole('dialog', { name: 'Save your workspace to your account' })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await dialog.getByLabel('Choose a passphrase').fill(PASSPHRASE)
  await dialog.getByLabel('Type it again').fill(PASSPHRASE)
  await dialog.getByRole('button', { name: 'Encrypt and continue' }).click()
  const keyDialog = page.getByRole('dialog', { name: 'Save your recovery key' })
  const recoveryKey =
    (await keyDialog.getByLabel('Recovery key', { exact: true }).textContent()) ?? ''
  expect(recoveryKey).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{1,4})+$/)
  await keyDialog.getByLabel('I’ve saved my recovery key somewhere safe').check()
  await keyDialog.getByRole('button', { name: 'Start saving' }).click()
  await expect(keyDialog).toBeHidden()
  return recoveryKey
}

async function newProject(page: Page) {
  await page.goto('/app/new')
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/, { timeout: 15_000 })
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
}

const saved = (vault: MockVault, key: string) =>
  [...vault.records.keys()].some((name) => name.endsWith(`/${key}`))

test.describe('J12: the encrypted workspace on a second device (F-SYNC)', () => {
  test('a project opens elsewhere with its questions, dashboard and file; the service sees only ciphertext', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const vault = mockVaultState()

    // Device A: set up, then a sample, a question, a pinned answer and a file of its own.
    const a = await device(browser, vault)
    const recoveryKey = await setUp(a)
    await newProject(a)
    await a.getByRole('button', { name: 'Try sample data', exact: true }).click()
    await a.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
    await expect(a.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
      timeout: 60_000,
    })
    await a.getByRole('textbox', { name: 'Ask a question' }).fill(QUESTION)
    await a.getByRole('textbox', { name: 'Ask a question' }).press('Enter')
    const answer = a.getByRole('article', { name: QUESTION })
    await expect(answer.getByRole('tab', { name: 'Chart' })).toBeVisible({ timeout: 30_000 })
    await answer.getByRole('button', { name: 'Pin to dashboard' }).click()
    await a.getByRole('menuitem', { name: 'Pin chart' }).click()
    await a.getByTestId('file-input').first().setInputFiles([CSV])
    await expect(a.getByRole('region', { name: 'customers.csv' })).toBeVisible()

    // Saved: the project list, its history, dashboards and file list, and the file's chunk.
    await expect.poll(() => saved(vault, 'history'), { timeout: 20_000 }).toBe(true)
    await expect.poll(() => saved(vault, 'dashboards'), { timeout: 20_000 }).toBe(true)
    await expect.poll(() => vault.objects.size, { timeout: 20_000 }).toBe(1)
    const pill = a.getByRole('button', { name: /^Status: Strict, saved to your account/ })
    await expect(pill).toBeVisible({ timeout: 30_000 })
    await pill.click()
    await expect(a.getByRole('dialog')).toContainText('Encrypted and saved to your account.')
    await a.keyboard.press('Escape')

    // Device B: locked. A wrong passphrase is refused; the recovery key opens it.
    const b = await device(browser, vault)
    await b.goto('/app/')
    const unlock = b.getByRole('dialog', { name: 'Unlock your workspace' })
    await expect(unlock).toBeVisible({ timeout: 15_000 })
    await unlock.getByLabel('Passphrase').fill('not my passphrase at all')
    await unlock.getByRole('button', { name: 'Unlock' }).click()
    await expect(unlock.getByRole('alert')).toContainText('That passphrase doesn’t unlock')
    await unlock.getByRole('button', { name: 'Forgot it? Use your recovery key' }).click()
    await unlock
      .getByLabel('Recovery key', { exact: true })
      .fill(recoveryKey.toLowerCase().replaceAll('-', ' '))
    await unlock.getByLabel('New passphrase').fill('a brand new passphrase')
    await unlock.getByLabel('Type it again').fill('a brand new passphrase')
    await unlock.getByRole('button', { name: 'Unlock' }).click()
    await expect(unlock).toBeHidden({ timeout: 15_000 })

    // The project is there; its file comes down, decrypted, and loads; history and dashboard too.
    const card = b.getByRole('article', { name: 'Untitled project' })
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card).toContainText('1 dashboard · 1 question')
    await expect(card).toContainText('Account')
    await card.getByRole('link', { name: 'Untitled project' }).click()
    await expect(b.getByRole('region', { name: 'customers.csv' })).toBeVisible({ timeout: 30_000 })
    await expect(b.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
      timeout: 60_000,
    })
    await b.getByRole('button', { name: 'Side panel' }).click()
    const panel = b.getByRole('complementary', { name: 'Side panel' })
    await panel.getByRole('tab', { name: 'History' }).click()
    await expect(panel.getByRole('list', { name: 'History' })).toContainText(QUESTION)
    await b.getByRole('tab', { name: 'Dashboard' }).click()
    await expect(
      b
        .getByRole('main')
        .getByText(/Revenue growth by region/)
        .first(),
    ).toBeVisible()

    // The canary: nothing readable reached the service, from either device.
    expect(vault.sent.length).toBeGreaterThan(5)
    for (const body of vault.sent) {
      for (const secret of SECRETS) expect(body).not.toContain(secret)
    }
    expect(JSON.stringify(vault.vault)).not.toContain(PASSPHRASE)
  })

  test('a project kept on this device only leaves the account; a full account keeps files here', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const vault = mockVaultState()
    const a = await device(browser, vault)
    await setUp(a)
    await newProject(a)
    await a.getByTestId('file-input').first().setInputFiles([CSV])
    await expect(a.getByRole('region', { name: 'customers.csv' })).toBeVisible()
    await expect.poll(() => vault.objects.size, { timeout: 20_000 }).toBe(1)
    const scope = [...vault.records.values()].find((row) => row.key === 'history')?.scope ?? ''
    const projectRecords = () =>
      [...vault.records.values()].filter((row) => row.scope === scope).length

    // Keep it here: its records and file leave the account.
    await a.getByRole('button', { name: 'Project: Untitled project' }).click()
    await a.getByRole('menuitem', { name: 'Keep on this device only…' }).click()
    await a.getByRole('alertdialog').getByRole('button', { name: 'Keep on this device' }).click()
    await expect.poll(projectRecords, { timeout: 20_000 }).toBe(0)
    await expect.poll(() => vault.objects.size).toBe(0)
    await expect.poll(() => vault.files.size).toBe(0)

    // Back to the account, which is now full: the file stays here, and the app says so.
    vault.limit = 10
    await a.getByRole('button', { name: 'Project: Untitled project' }).click()
    await a.getByRole('menuitem', { name: 'Save to your account' }).click()
    await expect(a.getByText('Your account’s storage is full.')).toBeVisible({ timeout: 20_000 })
    expect(vault.objects.size).toBe(0)
    await expect(a.getByRole('region', { name: 'customers.csv' })).toBeVisible()
  })
})

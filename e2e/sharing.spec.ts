import { expect, test, type Page } from '@playwright/test'
import { E2E_USER, signIn } from './app.ts'
import { mockSupabase, type MockUser } from './supabase.ts'
import { mockCloud, type MockCloud } from './supabaseSharing.ts'

// J7, J8 and sharing (F-SHARE-01…07) against the mocked account service: consent before any upload,
// invites, view-only links opened with no account, revoking, "Shared with me", editors saving with
// a version check, and the owner updating the shared copy.

const SAMPLE = 'Global Sales · 10k rows'
const NAME = 'Global Sales overview'

const OWNER: MockUser = {
  id: 'user-owner',
  email: 'olivia@example.com',
  password: 'owner passphrase',
  name: 'Olivia Owner',
  provider: 'email',
}

/** A dashboard someone else shared: a KPI from its snapshot and a text tile. */
function seed(cloud: MockCloud, role: 'viewer' | 'editor') {
  const tile = {
    sql: null,
    chartSpec: null,
    datasetRefs: [],
    question: null,
    edited: false,
    createdAt: 1,
  }
  cloud.names.set(OWNER.id, OWNER.name)
  cloud.dashboards.push({
    id: 'cloud-seed',
    owner_id: OWNER.id,
    name: 'Q3 review',
    version: 1,
    updated_at: new Date().toISOString(),
    doc: {
      id: 'dash_seed',
      name: 'Q3 review',
      filters: [],
      createdAt: 1,
      updatedAt: 1,
      tiles: [
        {
          ...tile,
          id: 'tile_kpi',
          type: 'kpi',
          title: 'Revenue',
          sql: 'SELECT 1234 AS revenue',
          text: null,
          layout: { x: 0, y: 0, w: 3, h: 2 },
          snapshot: {
            columns: [{ name: 'revenue', duckType: 'DOUBLE', logicalType: 'number' }],
            rows: [[1234]],
            rowCount: 1,
            sampling: 'none',
            at: 1,
            filtered: false,
          },
        },
        {
          ...tile,
          id: 'tile_text',
          type: 'text',
          title: 'Notes',
          text: 'Text from the owner',
          layout: { x: 3, y: 0, w: 4, h: 2 },
          snapshot: null,
        },
      ],
    },
  })
  cloud.invites.push({
    dashboard_id: 'cloud-seed',
    email: E2E_USER.email,
    role,
    created_at: new Date().toISOString(),
  })
}

/** The shared copy's document, as text. */
const sharedDoc = (cloud: MockCloud) => JSON.stringify(cloud.dashboards[0]?.doc)

/** A new project with the sample and the generated dashboard (demo mode). */
async function buildDashboard(page: Page) {
  await page.goto('/app/new')
  await expect(page).toHaveURL(/\/app\/p\/[\w-]+$/, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: SAMPLE }).click()
  await expect(page.getByRole('region', { name: SAMPLE })).toBeVisible({ timeout: 60_000 })
  await page.getByRole('tab', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Generate dashboard' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Generate a dashboard' })
  await dialog.getByRole('button', { name: 'Generate' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

test.describe('J7 and J8: sharing a dashboard (F-SHARE-01…05, F-SHARE-07)', () => {
  test('consent before upload, invite, a link a guest opens, update, revoke, stop', async ({
    page,
    browser,
  }) => {
    const cloud = mockCloud()
    const service = await signIn(page, { cloud })
    await buildDashboard(page)

    // F-SHARE-02: exactly what will upload, and nothing sent before Confirm.
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    const consent = page.getByRole('dialog', { name: `Share “${NAME}”?` })
    const table = consent.getByRole('table', { name: 'What will upload, tile by tile' })
    await expect(
      table.getByRole('row', { name: /^Revenue by region Chart 5 region, revenue/ }),
    ).toBeVisible()
    await expect(consent.getByTestId('upload-total')).toHaveText(/^6 tiles · \d+ rows · [\d.]+ KB$/)
    await expect(consent).toContainText('Never uploaded: your files')
    expect(service.calls.filter((call) => call.includes('/rest/v1/dashboards'))).toEqual([])
    await consent.getByRole('button', { name: 'Upload and share' }).click()

    // F-SHARE-01: results only; no source files, tables or filters.
    const share = page.getByRole('dialog', { name: `Share “${NAME}”` })
    await expect(share.getByRole('heading', { name: 'People' })).toBeVisible()
    expect(cloud.dashboards).toHaveLength(1)
    const doc = cloud.dashboards[0]?.doc as { tiles: { datasetRefs: unknown[] }[] }
    expect(doc.tiles.every((tile) => tile.datasetRefs.length === 0)).toBe(true)

    // F-SHARE-03: invite by email.
    await share.getByLabel('Email').fill(' Vera@Example.com ')
    await share.getByRole('button', { name: 'Invite' }).click()
    const people = share.getByRole('list', { name: 'People with access' })
    await expect(people).toContainText('vera@example.com')
    await expect(people).toContainText('Invited')
    expect(cloud.invites).toEqual([
      expect.objectContaining({ email: 'vera@example.com', role: 'viewer' }),
    ])

    // F-SHARE-04: a view-only link that expires, copied.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await share.getByRole('combobox', { name: 'Expires' }).click()
    await page.getByRole('option', { name: 'In 7 days' }).click()
    await share.getByRole('button', { name: 'Create and copy link' }).click()
    const link = await share.getByRole('textbox', { name: 'Link' }).inputValue()
    expect(link).toMatch(/\/app\/s\/e2e-link-[\w-]+$/)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link)
    await expect(share).toContainText(/Expires \w+/)

    // F-SHARE-05: anyone with the link, with no account, no file and no key.
    const guest = await browser.newPage()
    const guestService = await mockSupabase(guest, { cloud })
    await guest.goto(new URL(link).pathname)
    await expect(guest.getByRole('heading', { level: 1, name: NAME })).toBeVisible()
    await expect(guest.getByText(`Shared by ${E2E_USER.name} · updated`)).toBeVisible()
    await expect(guest.getByText('View only')).toBeVisible()
    await expect(
      guest
        .getByRole('region', { name: 'Revenue by region' })
        .getByRole('img', { name: /^Bar chart/ }),
    ).toBeVisible()
    await expect(guest.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    // A link page reads the one dashboard and nothing else.
    expect(
      guestService.calls.every((call) => call.startsWith('POST /rest/v1/rpc/shared_dashboard')),
    ).toBe(true)

    // F-SHARE-07: someone edited the shared copy since; updating asks first.
    cloud.dashboards[0]!.version += 1
    await share.getByRole('button', { name: 'Update shared copy' }).click()
    const update = page.getByRole('dialog', { name: 'Update the shared copy?' })
    await update.getByRole('button', { name: 'Upload update' }).click()
    const conflict = page.getByRole('alertdialog', { name: 'Someone edited the shared copy' })
    await conflict.getByRole('button', { name: 'Replace their changes' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Updated the shared copy.' }),
    ).toBeVisible()
    expect(cloud.dashboards[0]?.version).toBe(3)

    // Revoking stops the link at once.
    await share.getByRole('button', { name: 'Revoke' }).click()
    await expect(share.getByText('No live links.')).toBeVisible()
    await guest.reload()
    await expect(
      guest.getByRole('heading', { name: 'This dashboard is no longer shared' }),
    ).toBeVisible()
    await guest.close()

    // Stopping deletes the shared copy; the dashboard stays here.
    await share.getByRole('button', { name: 'Stop sharing…' }).click()
    await share
      .getByRole('group', { name: 'Stop sharing' })
      .getByRole('button', { name: 'Stop sharing' })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: `Stopped sharing ${NAME}.` }),
    ).toBeVisible()
    expect(cloud.dashboards).toEqual([])
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
    await expect(
      page.getByRole('main').getByRole('region', { name: 'Monthly revenue' }),
    ).toBeVisible()
  })
})

test.describe('dashboards shared with you (F-SHARE-03, F-SHARE-05, F-SHARE-06)', () => {
  test('an invite resolves on sign-in: Shared with me, view only', async ({ page }) => {
    const cloud = mockCloud()
    seed(cloud, 'viewer')
    await signIn(page, { cloud, others: [OWNER] })
    await page.goto('/app/')
    const shared = page.getByRole('region', { name: 'Shared with me' })
    await shared.getByRole('link', { name: /Q3 review/ }).click()
    expect(cloud.members).toEqual([
      expect.objectContaining({ user_id: E2E_USER.id, role: 'viewer' }),
    ])

    await expect(page).toHaveURL(/\/app\/shared\/cloud-seed$/)
    await expect(page.getByText('Shared by Olivia Owner · updated')).toBeVisible()
    await expect(page.getByText('View only')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Notes' })).toContainText('Text from the owner')
    await expect(page.getByRole('region', { name: 'Revenue' })).toContainText('1,234')
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)

    // Leaving takes it off Home.
    await page.getByRole('button', { name: 'Leave' }).click()
    await expect(page).toHaveURL(/\/app\/$/)
    await expect(page.getByRole('region', { name: 'Shared with me' })).toContainText(
      'Dashboards people share with you appear here.',
    )
    expect(cloud.members).toEqual([])
  })

  test('an editor edits titles and text and saves against the version read', async ({ page }) => {
    const cloud = mockCloud()
    seed(cloud, 'editor')
    await signIn(page, { cloud, others: [OWNER] })
    await page.goto('/app/shared/cloud-seed')
    await expect(page.getByText('You can edit')).toBeVisible()

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    // Arranging by keyboard: the tile's menu moves it (the grid then saves the new layout).
    await page.getByRole('button', { name: 'Actions for Notes' }).click()
    await page.getByRole('menuitem', { name: 'Move earlier' }).click()
    await page.getByRole('button', { name: 'Actions for Notes' }).click()
    await page.getByRole('menuitem', { name: 'Edit…' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit tile' })
    await edit.getByLabel('Title').fill('Team notes')
    await edit.getByLabel('Text (Markdown)').fill('Edited by the team')
    await edit.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Team notes' })).toContainText(
      'Edited by the team',
    )
    expect(cloud.dashboards[0]?.version).toBe(2)
    expect(sharedDoc(cloud)).toContain('Edited by the team')
    const saved = cloud.dashboards[0]?.doc as { tiles: { id: string; layout: { x: number } }[] }
    expect(saved.tiles.find((tile) => tile.id === 'tile_text')?.layout.x).toBe(0)

    // Someone else saves meanwhile: saving again asks, and "Load their version" shows theirs.
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Actions for Team notes' }).click()
    await page.getByRole('menuitem', { name: 'Edit…' }).click()
    await edit.getByLabel('Title').fill('Mine')
    await edit.getByRole('button', { name: 'Done' }).click()
    const copy = cloud.dashboards[0]!
    copy.doc = JSON.parse(JSON.stringify(copy.doc).replace('Team notes', 'Theirs'))
    copy.version += 1
    await page.getByRole('button', { name: 'Save changes' }).click()
    const conflict = page.getByRole('alertdialog', { name: 'Someone saved a newer version' })
    await conflict.getByRole('button', { name: 'Load their version' }).click()
    await expect(page.getByRole('region', { name: 'Theirs' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  })
})

test('a link the service no longer knows says it is no longer shared', async ({ page }) => {
  const guest = await mockSupabase(page)
  await page.goto('/app/s/e2e-link-gone-abcdefghijklmnop')
  await expect(
    page.getByRole('heading', { name: 'This dashboard is no longer shared' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  // The link page asks the service about that one link, and nothing else.
  expect(new Set(guest.calls)).toEqual(new Set(['POST /rest/v1/rpc/shared_dashboard']))
})

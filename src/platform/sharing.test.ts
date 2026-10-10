import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppError } from '@/lib/errors'

// The sharing calls against a fake client (F-SHARE-01/04/06/07): what each answer from the service
// becomes. Row-level security itself is tested in Postgres (supabase/tests/sharing.test.sql).

type Result = { data: unknown; error: unknown }

/** A query builder: any chain of calls, then awaited, gives the next queued answer. */
const answers: Result[] = []
function builder(): unknown {
  const chain: unknown = new Proxy(
    {},
    {
      get: (_, prop) =>
        prop === 'then'
          ? (resolve: (value: Result) => void) =>
              resolve(answers.shift() ?? { data: null, error: null })
          : () => chain,
    },
  )
  return chain
}
const client = { from: () => builder(), rpc: () => builder() }
vi.mock('@/platform/supabase', () => ({ accountClient: () => client }))

const sharing = await import('@/platform/sharing')
const { DashboardSchema } = await import('@/dashboard/schema')

const doc = DashboardSchema.parse({
  id: 'd1',
  name: 'Sales review',
  tiles: [],
  filters: [],
  createdAt: 1,
  updatedAt: 1,
})

async function failure(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise
  } catch (error) {
    return error as AppError
  }
  throw new Error('expected it to fail')
}

beforeEach(() => {
  answers.length = 0
})

describe('platform sharing', () => {
  it('saves against the version it read', async () => {
    answers.push({ data: [{ id: 'c1', version: 4 }], error: null })
    await expect(sharing.updateDashboard('c1', doc, 3)).resolves.toEqual({ id: 'c1', version: 4 })
  })

  it('tells a newer version (a conflict) from a copy that is gone', async () => {
    answers.push({ data: [], error: null }, { data: { version: 5 }, error: null })
    expect((await failure(sharing.updateDashboard('c1', doc, 3))).code).toBe('share_conflict')
    answers.push({ data: [], error: null }, { data: null, error: null })
    expect((await failure(sharing.updateDashboard('c1', doc, 3))).code).toBe('share_gone')
  })

  it('says what to do when the database refuses a dashboard for its size', async () => {
    answers.push({
      data: null,
      error: {
        code: '23514',
        message:
          'new row for relation "dashboards" violates check constraint "dashboards_doc_size"',
      },
    })
    const error = await failure(sharing.saveDashboard(doc))
    expect(error.code).toBe('share_too_big')
    expect(error.message).toMatch(/Remove a few large tiles/)
  })

  it('opens a live link, and says a dead one is no longer shared', async () => {
    answers.push({
      data: [
        {
          name: 'Sales review',
          doc,
          owner_name: 'Olivia',
          updated_at: '2026-10-10T12:00:00+00:00',
        },
      ],
      error: null,
    })
    await expect(sharing.openLink('slug-0123456789abcdefghij')).resolves.toMatchObject({
      name: 'Sales review',
      ownerName: 'Olivia',
    })
    answers.push({ data: [], error: null })
    const error = await failure(sharing.openLink('slug-0123456789abcdefghij'))
    expect(error).toMatchObject({
      code: 'share_unavailable',
      message: 'This dashboard is no longer shared.',
    })
  })

  it('claims invites before listing what is shared with you', async () => {
    answers.push(
      { data: 1, error: null },
      {
        data: [
          {
            id: 'c1',
            name: 'Sales review',
            owner_name: 'Olivia',
            role: 'viewer',
            updated_at: '2026-10-10T12:00:00+00:00',
          },
        ],
        error: null,
      },
    )
    await expect(sharing.sharedWithMe()).resolves.toEqual([
      {
        id: 'c1',
        name: 'Sales review',
        ownerName: 'Olivia',
        role: 'viewer',
        updatedAt: '2026-10-10T12:00:00+00:00',
      },
    ])
    expect(answers).toHaveLength(0)
  })
})

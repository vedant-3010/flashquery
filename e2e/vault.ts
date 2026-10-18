import type { Page, Route } from '@playwright/test'
import { SUPABASE_URL } from './supabase.ts'

// The encrypted workspace (M17, F-SYNC) for the mocked account service: the vaults, sync_records
// and vault_files tables, sync_put / vault_reserve / vault_usage, and the private `vault` storage
// bucket, with supabase/migrations/…_vault.sql's rules in miniature (the real policies are tested
// in Postgres). One MockVault backs several pages: two devices of the same account. Add it after
// signIn(); without it the workspace is "not offered" (the tables answer 404).

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

interface Row {
  scope: string
  key: string
  version: number
  ciphertext: string
  updated_at: string
}

export interface MockVault {
  vault: Record<string, unknown> | null
  records: Map<string, Row>
  files: Map<string, { file_id: string; bytes: number; chunks: number; created_at: string }>
  /** Storage objects by path (`<user>/<file>/<chunk>`). */
  objects: Map<string, Buffer>
  /** Bytes the plan allows. */
  limit: number
  /** Every request body any page sent to the account service, as text (the canary reads them). */
  sent: string[]
}

export const mockVaultState = (): MockVault => ({
  vault: null,
  records: new Map(),
  files: new Map(),
  objects: new Map(),
  limit: 500_000_000,
  sent: [],
})

let tick = 0
/** The service's clock: increasing, like clock_timestamp(). */
const stamp = () => new Date(Date.UTC(2026, 9, 16, 9, 0, 0, (tick += 1))).toISOString()

const used = (state: MockVault) =>
  [...state.records.values()].reduce((sum, row) => sum + row.ciphertext.length, 0) +
  [...state.files.values()].reduce((sum, file) => sum + file.bytes, 0)

/** `?scope=eq.x&updated_at=gte.y` → filters, plus offset/limit and the selected columns. */
function query(url: URL) {
  const eq: Record<string, string> = {}
  let gte: string | null = null
  for (const [key, value] of url.searchParams) {
    if (value.startsWith('eq.')) eq[key] = decodeURIComponent(value.slice(3))
    if (key === 'updated_at' && value.startsWith('gte.')) gte = decodeURIComponent(value.slice(4))
  }
  const columns = (url.searchParams.get('select') ?? '*').split(',').map((c) => c.trim())
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const limit = Number(url.searchParams.get('limit') ?? 1000)
  return { eq, gte, columns, offset, limit }
}

const pick = (row: object, columns: string[]) =>
  columns.includes('*')
    ? row
    : Object.fromEntries(columns.map((c) => [c, (row as Record<string, unknown>)[c]]))

export async function mockVault(page: Page, state: MockVault): Promise<MockVault> {
  page.on('request', (request) => {
    if (!request.url().startsWith(SUPABASE_URL)) return
    const body = request.postDataBuffer()
    if (body) state.sent.push(body.toString('latin1'))
  })
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  const empty = (route: Route) => route.fulfill({ status: 204, headers: CORS })
  const raise = (route: Route, message: string) =>
    json(route, 400, { code: 'P0001', message, details: null, hint: null })
  const body = (route: Route) =>
    JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>

  await page.route(`${SUPABASE_URL}/rest/v1/vaults*`, async (route) => {
    const method = route.request().method()
    if (method === 'OPTIONS') return empty(route)
    if (method === 'GET') return json(route, 200, state.vault ? [state.vault] : [])
    if (method === 'POST') {
      if (state.vault) {
        return json(route, 409, { code: '23505', message: 'duplicate key value', details: null })
      }
      state.vault = { ...body(route), created_at: stamp() }
      return json(route, 201, state.vault)
    }
    if (method === 'PATCH') {
      if (state.vault) state.vault = { ...state.vault, ...body(route) }
      return empty(route)
    }
    state.vault = null
    return empty(route)
  })

  await page.route(`${SUPABASE_URL}/rest/v1/sync_records*`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return empty(route)
    const { eq, gte, columns, offset, limit } = query(new URL(request.url()))
    const rows = [...state.records.values()]
      .filter((row) => Object.entries(eq).every(([k, v]) => String(row[k as keyof Row]) === v))
      .filter((row) => gte === null || row.updated_at >= gte)
      .sort(
        (a, b) =>
          a.updated_at.localeCompare(b.updated_at) ||
          a.scope.localeCompare(b.scope) ||
          a.key.localeCompare(b.key),
      )
    if (request.method() === 'DELETE') {
      for (const row of rows) state.records.delete(`${row.scope}/${row.key}`)
      return empty(route)
    }
    return json(
      route,
      200,
      rows.slice(offset, offset + limit).map((row) => pick(row, columns)),
    )
  })

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/sync_put`, async (route) => {
    if (route.request().method() === 'OPTIONS') return empty(route)
    if (!state.vault) return raise(route, 'vault_missing')
    const args = body(route) as {
      record_scope: string
      record_key: string
      expected: number
      sealed: string
    }
    const name = `${args.record_scope}/${args.record_key}`
    const current = state.records.get(name)
    if ((current?.version ?? 0) !== args.expected) return json(route, 200, null)
    const grows = args.sealed.length - (current?.ciphertext.length ?? 0)
    if (used(state) + grows > state.limit) return raise(route, 'storage_full')
    const version = args.expected + 1
    state.records.set(name, {
      scope: args.record_scope,
      key: args.record_key,
      version,
      ciphertext: args.sealed,
      updated_at: stamp(),
    })
    return json(route, 200, version)
  })

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/vault_reserve`, async (route) => {
    if (route.request().method() === 'OPTIONS') return empty(route)
    if (!state.vault) return raise(route, 'vault_missing')
    const args = body(route) as { file: string; file_bytes: number; file_chunks: number }
    if (!state.files.has(args.file)) {
      if (used(state) + args.file_bytes > state.limit) {
        return json(route, 200, {
          ok: false,
          reason: 'storage_full',
          used: used(state),
          limit: state.limit,
        })
      }
      state.files.set(args.file, {
        file_id: args.file,
        bytes: args.file_bytes,
        chunks: args.file_chunks,
        created_at: stamp(),
      })
    }
    return json(route, 200, { ok: true, used: used(state), limit: state.limit })
  })

  await page.route(`${SUPABASE_URL}/rest/v1/rpc/vault_usage`, (route) =>
    json(route, 200, { used: used(state), limit: state.limit }),
  )

  await page.route(`${SUPABASE_URL}/rest/v1/vault_files*`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return empty(route)
    const { eq } = query(new URL(request.url()))
    if (request.method() === 'DELETE') {
      for (const id of [...state.files.keys()]) {
        if (eq.file_id === undefined || eq.file_id === id) state.files.delete(id)
      }
      return empty(route)
    }
    return json(route, 200, [...state.files.values()])
  })

  await page.route(`${SUPABASE_URL}/storage/v1/object/vault**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return empty(route)
    const path = decodeURIComponent(
      new URL(request.url()).pathname.replace('/storage/v1/object/vault', '').replace(/^\//, ''),
    )
    if (request.method() === 'POST') {
      const [, fileId = '', index = ''] = path.split('/')
      const file = state.files.get(fileId)
      if (!file || Number(index) >= file.chunks) {
        return json(route, 403, { statusCode: '403', error: 'Unauthorized', message: 'RLS' })
      }
      if (state.objects.has(path)) {
        return json(route, 400, {
          statusCode: '409',
          error: 'Duplicate',
          message: 'The resource already exists',
        })
      }
      state.objects.set(path, request.postDataBuffer() ?? Buffer.alloc(0))
      return json(route, 200, { Key: `vault/${path}`, Id: path })
    }
    if (request.method() === 'DELETE') {
      const { prefixes = [] } = body(route) as { prefixes?: string[] }
      for (const prefix of prefixes) state.objects.delete(prefix)
      return json(route, 200, [])
    }
    const object = state.objects.get(path)
    if (!object) {
      return json(route, 400, {
        statusCode: '404',
        error: 'not_found',
        message: 'Object not found',
      })
    }
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/octet-stream' },
      body: object,
    })
  })
  return state
}

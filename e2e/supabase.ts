import type { Page, Route } from '@playwright/test'

// A mocked account service (F-ACCT, M13) for e2e: just enough of Supabase Auth (GoTrue) and the
// profiles table for the real supabase-js in the browser. The dev server learns the URL from
// window.__flashQueryAccounts; CI's production build is built with the same URL (ci.yml).

declare global {
  interface Window {
    __flashQueryAccounts?: { url: string; key: string }
  }
}

export const SUPABASE_URL = 'https://e2e-project.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_e2e'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

export interface MockUser {
  id: string
  email: string
  password: string
  name: string
  provider: string
}

export interface MockSupabase {
  users: MockUser[]
  /** "METHOD /path" of every request, for asserting what the app asked. */
  calls: string[]
  /** Request bodies by path (the last one). */
  bodies: Map<string, unknown>
}

const userJson = (user: MockUser) => ({
  id: user.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: user.email,
  email_confirmed_at: '2026-10-10T00:00:00Z',
  phone: '',
  confirmed_at: '2026-10-10T00:00:00Z',
  last_sign_in_at: '2026-10-10T00:00:00Z',
  app_metadata: { provider: user.provider, providers: [user.provider] },
  user_metadata: { full_name: user.name },
  identities: [],
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
  is_anonymous: false,
})

/** A session as supabase-js stores it (localStorage) and as the token endpoint returns it. */
export const sessionFor = (user: MockUser) => ({
  access_token: `e2e-access-${user.id}`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: `e2e-refresh-${user.id}`,
  user: userJson(user),
})

/**
 * Points the app at the mocked service and answers it. `confirmEmail`: new accounts must confirm
 * their address first (no session from sign-up). `oauthUser`: who Google or GitHub signs in.
 */
/** Where supabase-js keeps the mocked project's session (sb-<project>-auth-token). */
export const SESSION_KEY = 'sb-e2e-project-auth-token'

export async function mockSupabase(
  page: Page,
  {
    users = [],
    confirmEmail = false,
    oauthUser,
  }: { users?: MockUser[]; confirmEmail?: boolean; oauthUser?: MockUser } = {},
): Promise<MockSupabase> {
  await page.addInitScript(
    ({ url, key }) => {
      window.__flashQueryAccounts = { url, key }
    },
    { url: SUPABASE_URL, key: SUPABASE_KEY },
  )
  const state: MockSupabase = { users: [...users], calls: [], bodies: new Map() }
  // The account a code (email link, OAuth, reset) signs in: the last one asked for.
  let pending: MockUser | undefined = oauthUser

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: body === null ? '' : JSON.stringify(body),
    })
  const fail = (route: Route, status: number, code: string, msg: string) =>
    json(route, status, { code: status, error_code: code, msg })

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const url = new URL(request.url())
    const path = url.pathname
    state.calls.push(`${request.method()} ${path}${url.search}`)
    const body = request.postData()
      ? (JSON.parse(request.postData() ?? '{}') as Record<string, unknown>)
      : {}
    state.bodies.set(path, body)
    const byEmail = (email: unknown) => state.users.find((u) => u.email === email)
    const fromToken = () => {
      const token = request.headers().authorization?.replace('Bearer e2e-access-', '')
      return state.users.find((u) => u.id === token)
    }

    if (path === '/auth/v1/signup') {
      if (byEmail(body.email))
        return fail(route, 422, 'user_already_exists', 'User already registered')
      const data = (body.data ?? {}) as { full_name?: string }
      const user: MockUser = {
        id: `user-${state.users.length + 1}`,
        email: String(body.email),
        password: String(body.password),
        name: data.full_name ?? '',
        provider: 'email',
      }
      state.users.push(user)
      return json(route, 200, confirmEmail ? userJson(user) : sessionFor(user))
    }
    if (path === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type')
      if (grant === 'password') {
        const user = byEmail(body.email)
        if (!user || user.password !== body.password) {
          return fail(route, 400, 'invalid_credentials', 'Invalid login credentials')
        }
        return json(route, 200, sessionFor(user))
      }
      if (grant === 'pkce' && pending) return json(route, 200, sessionFor(pending))
      return fail(route, 400, 'bad_code_verifier', 'code challenge does not match')
    }
    if (path === '/auth/v1/otp' || path === '/auth/v1/recover') {
      pending = byEmail(body.email)
      return json(route, 200, {})
    }
    if (path === '/auth/v1/authorize') {
      // Google or GitHub said yes: back to the app with a code (PKCE).
      const back = new URL(url.searchParams.get('redirect_to') ?? '')
      back.searchParams.set('code', 'e2e-oauth-code')
      return route.fulfill({ status: 302, headers: { location: back.toString() } })
    }
    if (path === '/auth/v1/user') {
      const user = fromToken()
      if (!user) return fail(route, 401, 'bad_jwt', 'invalid JWT')
      if (request.method() === 'PUT' && typeof body.password === 'string')
        user.password = body.password
      return json(route, 200, userJson(user))
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS })
    if (path === '/rest/v1/profiles') {
      const user = fromToken()
      if (!user) return json(route, 200, [])
      if (request.method() === 'PATCH') {
        user.name = String(body.display_name ?? user.name)
        return route.fulfill({ status: 204, headers: CORS })
      }
      return json(route, 200, [{ id: user.id, display_name: user.name }])
    }
    if (path === '/rest/v1/rpc/delete_my_account') {
      const user = fromToken()
      state.users = state.users.filter((u) => u !== user)
      return route.fulfill({ status: 204, headers: CORS })
    }
    return fail(route, 404, 'not_found', `Not mocked: ${path}`)
  })
  return state
}

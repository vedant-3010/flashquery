import { isRecord } from './http.ts'

// The Edge Functions' way into Supabase: the signed-in user (Auth) and the service-role calls
// (PostgREST RPCs). Plain fetch, so tests pass a fake one. The secret key stays in the function.

export interface SignedInUser {
  id: string
  email: string | null
}

export interface Rest {
  /** Who the access token belongs to, or null when it isn't a valid session. */
  user(token: string): Promise<SignedInUser | null>
  /** A service-role RPC (row-level security doesn't apply; the function checks who may). */
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>
  /** One row of a table, as the service role (`filter` is a PostgREST query string). */
  selectOne(table: string, filter: string, columns: string): Promise<Record<string, unknown> | null>
}

export function supabaseRest({
  url,
  serviceKey,
  fetch,
}: {
  url: string
  serviceKey: string
  fetch: typeof globalThis.fetch
}): Rest {
  // Legacy service_role keys are JWTs and also go in Authorization; new secret keys only in apikey.
  const service: Record<string, string> = serviceKey.startsWith('eyJ')
    ? { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
    : { apikey: serviceKey }

  return {
    async user(token) {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: serviceKey, authorization: `Bearer ${token}` },
      })
      if (!response.ok) return null
      const body: unknown = await response.json()
      if (!isRecord(body) || typeof body.id !== 'string') return null
      return { id: body.id, email: typeof body.email === 'string' ? body.email : null }
    },
    async rpc(name, args) {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { ...service, 'content-type': 'application/json' },
        body: JSON.stringify(args),
      })
      if (!response.ok) throw new Error(`rpc ${name} failed: ${response.status}`)
      // A function returning void answers 204 with no body.
      const text = await response.text()
      return text ? (JSON.parse(text) as unknown) : null
    },
    async selectOne(table, filter, columns) {
      const response = await fetch(
        `${url}/rest/v1/${table}?${filter}&select=${encodeURIComponent(columns)}&limit=1`,
        { headers: service },
      )
      if (!response.ok) throw new Error(`select ${table} failed: ${response.status}`)
      const rows: unknown = await response.json()
      return Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : null
    },
  }
}

/** The function's secret key: a new `sb_secret_…` key when the project has one, else service_role. */
export function serviceKeyFrom(get: (name: string) => string | undefined): string | null {
  const keys = get('SUPABASE_SECRET_KEYS')
  if (keys) {
    try {
      const parsed: unknown = JSON.parse(keys)
      if (isRecord(parsed) && typeof parsed.default === 'string') return parsed.default
    } catch {
      // Fall through to the legacy key.
    }
  }
  return get('SUPABASE_SERVICE_ROLE_KEY') ?? null
}

/** APP_ORIGINS: a comma-separated list of the app's origins (https://hushglance.app,…). */
export function originsFrom(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter((origin) => /^https?:\/\/[^/]+$/.test(origin))
}

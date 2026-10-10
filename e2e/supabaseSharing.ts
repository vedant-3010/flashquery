import type { Route } from '@playwright/test'
import type { MockUser } from './supabase.ts'

// The sharing tables and functions (F-SHARE, M14) for the mocked account service: dashboards,
// members, invites and links, with the row-level rules of supabase/migrations/…_sharing.sql in
// miniature (the real policies are tested in Postgres). One MockCloud can back several pages, so an
// owner, a member and a guest see the same dashboards.

export interface CloudDashboard {
  id: string
  owner_id: string
  name: string
  doc: unknown
  version: number
  updated_at: string
}

export interface MockCloud {
  dashboards: CloudDashboard[]
  members: { dashboard_id: string; user_id: string; role: string; email: string }[]
  invites: { dashboard_id: string; email: string; role: string; created_at: string }[]
  links: {
    slug: string
    dashboard_id: string
    expires_at: string | null
    revoked_at: string | null
    created_at: string
  }[]
  /** Everyone's names, for "Shared by …" (the profiles table). */
  names: Map<string, string>
}

export const mockCloud = (): MockCloud => ({
  dashboards: [],
  members: [],
  invites: [],
  links: [],
  names: new Map(),
})

let counter = 0
const now = () => new Date().toISOString()

interface Request {
  route: Route
  method: string
  path: string
  url: URL
  body: Record<string, unknown>
  user: MockUser | undefined
  /** supabase-js asked for one object (`.single()`), not an array. */
  single: boolean
  json: (status: number, body: unknown) => Promise<void>
}

/** `?id=eq.x&version=eq.3` → { id: 'x', version: '3' } */
function filters(url: URL): Record<string, string> {
  const found: Record<string, string> = {}
  for (const [key, value] of url.searchParams) {
    if (value.startsWith('eq.')) found[key] = decodeURIComponent(value.slice(3))
  }
  return found
}

const matches = (row: object, where: Record<string, string>) =>
  Object.entries(where).every(
    ([key, value]) => String((row as Record<string, unknown>)[key]) === value,
  )

function roleOf(cloud: MockCloud, dashboardId: string, user: MockUser | undefined): string | null {
  if (!user) return null
  const dashboard = cloud.dashboards.find((d) => d.id === dashboardId)
  if (dashboard?.owner_id === user.id) return 'owner'
  return (
    cloud.members.find((m) => m.dashboard_id === dashboardId && m.user_id === user.id)?.role ?? null
  )
}

const live = (link: MockCloud['links'][number]) =>
  link.revoked_at === null && (link.expires_at === null || Date.parse(link.expires_at) > Date.now())

/** Answers a sharing request; false when the path isn't one of them. */
export async function handleSharing(cloud: MockCloud, request: Request): Promise<boolean> {
  const { method, path, body, user, url, json } = request
  const where = filters(url)
  const reply = (rows: unknown[]) =>
    request.single
      ? rows[0] === undefined
        ? json(406, {
            code: 'PGRST116',
            message: 'JSON object requested, multiple (or no) rows returned',
          })
        : json(method === 'POST' ? 201 : 200, rows[0])
      : json(200, rows)
  const ownerOnly = (dashboardId: unknown) => roleOf(cloud, String(dashboardId), user) === 'owner'
  const name = (id: string) => cloud.names.get(id) ?? ''

  if (path === '/rest/v1/dashboards') {
    const visible = cloud.dashboards.filter((d) => roleOf(cloud, d.id, user) !== null)
    if (method === 'POST') {
      if (!user) return json(401, { code: '42501', message: 'permission denied' }).then(() => true)
      const row: CloudDashboard = {
        id: `cloud-${(counter += 1)}`,
        owner_id: user.id,
        name: String(body.name),
        doc: body.doc,
        version: 1,
        updated_at: now(),
      }
      cloud.dashboards.push(row)
      cloud.names.set(user.id, user.name)
      await reply([row])
      return true
    }
    if (method === 'PATCH') {
      const changed = visible
        .filter((d) => ['owner', 'editor'].includes(roleOf(cloud, d.id, user) ?? ''))
        .filter((d) => matches(d, where))
      for (const d of changed) Object.assign(d, body, { version: d.version + 1, updated_at: now() })
      await reply(changed)
      return true
    }
    if (method === 'DELETE') {
      const gone = visible.filter((d) => d.owner_id === user?.id && matches(d, where))
      cloud.dashboards = cloud.dashboards.filter((d) => !gone.includes(d))
      await json(204, null)
      return true
    }
    await reply(visible.filter((d) => matches(d, where)))
    return true
  }

  if (path === '/rest/v1/dashboard_invites') {
    const dashboardId = body.dashboard_id ?? where.dashboard_id
    if (!ownerOnly(dashboardId)) {
      await json(403, { code: '42501', message: 'new row violates row-level security policy' })
      return true
    }
    if (method === 'POST') {
      cloud.invites = cloud.invites.filter(
        (i) => !(i.dashboard_id === dashboardId && i.email === body.email),
      )
      cloud.invites.push({
        dashboard_id: String(dashboardId),
        email: String(body.email),
        role: String(body.role),
        created_at: now(),
      })
    } else if (method === 'DELETE') {
      cloud.invites = cloud.invites.filter((i) => !matches(i, where))
    }
    await json(201, null)
    return true
  }

  if (path === '/rest/v1/dashboard_members' && method === 'DELETE') {
    cloud.members = cloud.members.filter(
      (m) => !(matches(m, where) && (m.user_id === user?.id || ownerOnly(m.dashboard_id))),
    )
    await json(204, null)
    return true
  }

  if (path === '/rest/v1/share_links') {
    if (method === 'POST') {
      if (!ownerOnly(body.dashboard_id)) {
        await json(403, { code: '42501', message: 'new row violates row-level security policy' })
        return true
      }
      const link = {
        slug: `e2e-link-${(counter += 1)}-abcdefghijklmnop`,
        dashboard_id: String(body.dashboard_id),
        expires_at: typeof body.expires_at === 'string' ? body.expires_at : null,
        revoked_at: null,
        created_at: now(),
      }
      cloud.links.push(link)
      await reply([link])
      return true
    }
    const mine = cloud.links.filter((l) => ownerOnly(l.dashboard_id) && matches(l, where))
    if (method === 'PATCH') {
      for (const link of mine) Object.assign(link, body)
      await json(204, null)
      return true
    }
    await reply([...mine].reverse())
    return true
  }

  if (path === '/rest/v1/rpc/shared_dashboard') {
    const link = cloud.links.find((l) => l.slug === body.link && live(l))
    const d = cloud.dashboards.find((x) => x.id === link?.dashboard_id)
    await json(
      200,
      d
        ? [{ name: d.name, doc: d.doc, owner_name: name(d.owner_id), updated_at: d.updated_at }]
        : [],
    )
    return true
  }
  if (path === '/rest/v1/rpc/claim_invites') {
    const mine = cloud.invites.filter((i) => i.email === user?.email)
    cloud.invites = cloud.invites.filter((i) => !mine.includes(i))
    for (const invite of mine) {
      if (!user || roleOf(cloud, invite.dashboard_id, user) === 'owner') continue
      cloud.members = cloud.members.filter(
        (m) => !(m.dashboard_id === invite.dashboard_id && m.user_id === user.id),
      )
      cloud.members.push({ ...invite, user_id: user.id })
      cloud.names.set(user.id, user.name)
    }
    await json(200, mine.length)
    return true
  }
  if (path === '/rest/v1/rpc/open_dashboard') {
    const d = cloud.dashboards.find((x) => x.id === body.dashboard)
    const role = d ? roleOf(cloud, d.id, user) : null
    await json(
      200,
      d && role ? [{ ...d, owner_name: name(d.owner_id), role, owner_id: undefined }] : [],
    )
    return true
  }
  if (path === '/rest/v1/rpc/shared_with_me') {
    const rows = cloud.members
      .filter((m) => m.user_id === user?.id)
      .flatMap((m) => {
        const d = cloud.dashboards.find((x) => x.id === m.dashboard_id)
        return d
          ? [
              {
                id: d.id,
                name: d.name,
                owner_name: name(d.owner_id),
                role: m.role,
                updated_at: d.updated_at,
              },
            ]
          : []
      })
    await json(200, rows)
    return true
  }
  if (path === '/rest/v1/rpc/dashboard_people') {
    if (!ownerOnly(body.dashboard)) {
      await json(403, { code: '42501', message: 'Only the owner sees who it is shared with' })
      return true
    }
    await json(200, [
      ...cloud.members
        .filter((m) => m.dashboard_id === body.dashboard)
        .map((m) => ({
          kind: 'member',
          user_id: m.user_id,
          name: name(m.user_id),
          email: m.email,
          role: m.role,
        })),
      ...cloud.invites
        .filter((i) => i.dashboard_id === body.dashboard)
        .map((i) => ({ kind: 'invite', user_id: null, name: '', email: i.email, role: i.role })),
    ])
    return true
  }
  return false
}

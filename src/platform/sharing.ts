import { AppError } from '@/lib/errors'
import { z } from '@/lib/zod'
import {
  MemberDashboardSchema,
  PersonSchema,
  SharedDashboardSchema,
  SharedEntrySchema,
  ShareLinkSchema,
  type MemberDashboard,
  type Person,
  type SharedDashboard,
  type SharedEntry,
  type ShareLink,
} from '@/dashboard/cloud'
import type { Dashboard } from '@/dashboard/schema'
import { accountError } from '@/platform/errors'
import { accountClient as client } from '@/platform/supabase'

// Sharing (F-SHARE-01…07, D116): dashboards saved to the account, invites by email, view-only
// links. Lazy, like auth.ts. What a dashboard uploads is decided in src/dashboard/cloud.ts (callers
// pass `toSharedDoc`); row-level security decides who may read and change it
// (supabase/migrations/…_sharing.sql, tested in supabase/tests/sharing.test.sql).

export type InviteRole = 'viewer' | 'editor'

const SavedSchema = z.object({ id: z.string(), version: z.number().int() })
export type Saved = z.infer<typeof SavedSchema>

/** Too big, or anything else the service refused, in words a person can act on. */
function sharingError(error: unknown): AppError {
  const raw = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  if (raw.code === '23514' && String(raw.message).includes('dashboards_doc_size')) {
    return new AppError({
      code: 'share_too_big',
      message: 'This dashboard is over 5 MB. Remove a few large tiles and try again.',
      detail: String(raw.message),
    })
  }
  if (raw.code === '42501') {
    return new AppError({
      code: 'share_forbidden',
      message: 'You don’t have access to that anymore.',
      detail: String(raw.message),
    })
  }
  return accountError(error)
}

const gone = () =>
  new AppError({
    code: 'share_gone',
    message: 'This shared dashboard was deleted, or you no longer have access to it.',
    detail: null,
  })

/** Saves a new shared copy (F-SHARE-01). */
export async function saveDashboard(doc: Dashboard): Promise<Saved> {
  const { data, error } = await client()
    .from('dashboards')
    .insert({ name: doc.name, doc })
    .select('id, version')
    .single()
  if (error) throw sharingError(error)
  return SavedSchema.parse(data)
}

/**
 * Saves over a shared copy, if it's still at the version this device read (F-SHARE-06/07); null
 * saves whatever is there. A newer version: an AppError 'share_conflict'.
 */
export async function updateDashboard(
  id: string,
  doc: Dashboard,
  expectedVersion: number | null,
): Promise<Saved> {
  let query = client().from('dashboards').update({ name: doc.name, doc }).eq('id', id)
  if (expectedVersion !== null) query = query.eq('version', expectedVersion)
  const { data, error } = await query.select('id, version')
  if (error) throw sharingError(error)
  const saved = z.array(SavedSchema).parse(data)[0]
  if (saved) return saved
  // Nothing changed: someone saved first, or it's gone.
  const current = await client().from('dashboards').select('version').eq('id', id).maybeSingle()
  if (current.error) throw sharingError(current.error)
  const found = z.object({ version: z.number().int() }).nullable().parse(current.data)
  if (found === null) throw gone()
  throw new AppError({
    code: 'share_conflict',
    message: 'Someone saved a newer version of this dashboard.',
    detail: `Expected version ${String(expectedVersion)}, found ${found.version}.`,
  })
}

/** Whether this account can still see the shared copy (it may have been deleted elsewhere). */
export async function dashboardExists(id: string): Promise<boolean> {
  const { data, error } = await client().from('dashboards').select('id').eq('id', id).maybeSingle()
  if (error) throw sharingError(error)
  return data !== null
}

/** Stops sharing: the shared copy, its members, invites and links go (the database cascades). */
export async function deleteDashboard(id: string): Promise<void> {
  const { error } = await client().from('dashboards').delete().eq('id', id)
  if (error) throw sharingError(error)
}

const SharedRowSchema = z
  .object({ name: z.string(), doc: z.unknown(), owner_name: z.string(), updated_at: z.string() })
  .transform((row) => ({
    name: row.name,
    doc: row.doc,
    ownerName: row.owner_name,
    updatedAt: row.updated_at,
  }))

/** A view-only link (F-SHARE-04), with or without an account. */
export async function openLink(slug: string): Promise<SharedDashboard> {
  const { data, error } = await client().rpc('shared_dashboard', { link: slug })
  if (error) throw sharingError(error)
  const row = z.array(SharedRowSchema).parse(data)[0]
  if (!row) {
    throw new AppError({
      code: 'share_unavailable',
      message: 'This dashboard is no longer shared.',
      detail: 'The link was revoked, it expired, or the dashboard was deleted.',
    })
  }
  return SharedDashboardSchema.parse(row)
}

/** A dashboard you own or were invited to (F-SHARE-05), with your role. */
export async function openMember(id: string): Promise<MemberDashboard> {
  await claimInvites()
  const { data, error } = await client().rpc('open_dashboard', { dashboard: id })
  if (error) throw sharingError(error)
  const row = z
    .array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          doc: z.unknown(),
          version: z.number().int(),
          owner_name: z.string(),
          role: z.string(),
          updated_at: z.string(),
        })
        .transform(({ owner_name, updated_at, ...rest }) => ({
          ...rest,
          ownerName: owner_name,
          updatedAt: updated_at,
        })),
    )
    .parse(data)[0]
  if (!row) throw gone()
  return MemberDashboardSchema.parse(row)
}

/** Invites to this account's confirmed address become memberships (F-SHARE-03). How many. */
export async function claimInvites(): Promise<number> {
  const { data, error } = await client().rpc('claim_invites')
  if (error) throw sharingError(error)
  return z.number().int().parse(data)
}

/** Home's "Shared with me" (F-SHARE-05), after claiming any new invites. */
export async function sharedWithMe(): Promise<SharedEntry[]> {
  await claimInvites()
  const { data, error } = await client().rpc('shared_with_me')
  if (error) throw sharingError(error)
  return z
    .array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          owner_name: z.string(),
          role: z.string(),
          updated_at: z.string(),
        })
        .transform(({ owner_name, updated_at, ...rest }) => ({
          ...rest,
          ownerName: owner_name,
          updatedAt: updated_at,
        })),
    )
    .parse(data)
    .map((row) => SharedEntrySchema.parse(row))
}

const OwnedRowSchema = z
  .object({ id: z.string(), name: z.string(), updated_at: z.string() })
  .transform((row) => ({ id: row.id, name: row.name, updatedAt: row.updated_at }))
export type OwnedEntry = z.output<typeof OwnedRowSchema>

/**
 * Home's "Shared by you": every shared copy this account owns, including ones whose dashboard is
 * no longer on this device (another browser, cleared data), so they can still be stopped.
 */
export async function sharedByMe(ownerId: string): Promise<OwnedEntry[]> {
  const { data, error } = await client()
    .from('dashboards')
    .select('id, name, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })
  if (error) throw sharingError(error)
  return z.array(OwnedRowSchema).parse(data)
}

/** Members and pending invites (F-SHARE-03). The owner only. */
export async function people(dashboardId: string): Promise<Person[]> {
  const { data, error } = await client().rpc('dashboard_people', { dashboard: dashboardId })
  if (error) throw sharingError(error)
  return z
    .array(
      z
        .object({
          kind: z.string(),
          user_id: z.string().nullable(),
          name: z.string(),
          email: z.string(),
          role: z.string(),
        })
        .transform(({ user_id, ...rest }) => ({ ...rest, userId: user_id })),
    )
    .parse(data)
    .map((row) => PersonSchema.parse(row))
}

/** Invites an address; inviting it again changes the role. It resolves when they sign in. */
export async function invite(dashboardId: string, email: string, role: InviteRole): Promise<void> {
  const { error } = await client()
    .from('dashboard_invites')
    .upsert({ dashboard_id: dashboardId, email, role }, { onConflict: 'dashboard_id,email' })
  if (error) throw sharingError(error)
}

export async function removeInvite(dashboardId: string, email: string): Promise<void> {
  const { error } = await client()
    .from('dashboard_invites')
    .delete()
    .eq('dashboard_id', dashboardId)
    .eq('email', email)
  if (error) throw sharingError(error)
}

/** The owner removes a member, or a member leaves (their own id). */
export async function removeMember(dashboardId: string, userId: string): Promise<void> {
  const { error } = await client()
    .from('dashboard_members')
    .delete()
    .eq('dashboard_id', dashboardId)
    .eq('user_id', userId)
  if (error) throw sharingError(error)
}

const LinkRowSchema = z
  .object({
    slug: z.string(),
    expires_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
    created_at: z.string(),
  })
  .transform((row) => ({
    slug: row.slug,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }))
const LINK_COLUMNS = 'slug, expires_at, revoked_at, created_at'

/** The dashboard's view-only links, newest first (F-SHARE-04). */
export async function listLinks(dashboardId: string): Promise<ShareLink[]> {
  const { data, error } = await client()
    .from('share_links')
    .select(LINK_COLUMNS)
    .eq('dashboard_id', dashboardId)
    .order('created_at', { ascending: false })
  if (error) throw sharingError(error)
  return z
    .array(LinkRowSchema)
    .parse(data)
    .map((row) => ShareLinkSchema.parse(row))
}

/** A new link; the database picks its unguessable slug. */
export async function createLink(dashboardId: string, expiresAt: Date | null): Promise<ShareLink> {
  const { data, error } = await client()
    .from('share_links')
    .insert({ dashboard_id: dashboardId, expires_at: expiresAt?.toISOString() ?? null })
    .select(LINK_COLUMNS)
    .single()
  if (error) throw sharingError(error)
  return ShareLinkSchema.parse(LinkRowSchema.parse(data))
}

/** The link stops working at once; anyone opening it reads "no longer shared". */
export async function revokeLink(slug: string): Promise<void> {
  const { error } = await client()
    .from('share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('slug', slug)
  if (error) throw sharingError(error)
}

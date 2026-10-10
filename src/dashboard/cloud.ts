import { z } from '@/lib/zod'
import { DashboardSchema, type Dashboard, type TileType } from '@/dashboard/schema'

// What sharing uploads (F-SHARE-01/02, D103, D116), decided here and nowhere else. A shared dashboard
// is its document: layout, titles, SQL, chart specs, text and each tile's last result (≤ 5,000
// rows, as kept locally). Never source files, never which files or tables the results came from,
// never the dashboard's filters (the results already reflect them). Pure.

/** The cap the database enforces is 5 MB of its JSON; this leaves room for how it formats it. */
export const MAX_SHARED_BYTES = 4_500_000

/** The document as uploaded: the dashboard, minus what stays on this device. */
export function toSharedDoc(dashboard: Dashboard): Dashboard {
  const { cloud: _local, ...rest } = dashboard
  return {
    ...rest,
    filters: [],
    tiles: dashboard.tiles.map((tile) => ({ ...tile, datasetRefs: [] })),
  }
}

export interface TileUpload {
  id: string
  title: string
  type: TileType
  /** Rows of results in its snapshot (0 for text, or before it has run). */
  rows: number
  columns: string[]
  sql: boolean
}

export interface UploadSummary {
  tiles: TileUpload[]
  rows: number
  /** Size of the document as uploaded (UTF-8 JSON). */
  bytes: number
  tooBig: boolean
}

/** What the consent dialog lists (F-SHARE-02): every tile, its rows and columns, and the size. */
export function describeUpload(dashboard: Dashboard): UploadSummary {
  const doc = toSharedDoc(dashboard)
  const tiles = doc.tiles.map((tile) => ({
    id: tile.id,
    title: tile.title,
    type: tile.type,
    rows: tile.snapshot?.rows.length ?? 0,
    columns: tile.snapshot?.columns.map((column) => column.name) ?? [],
    sql: Boolean(tile.sql),
  }))
  const bytes = new TextEncoder().encode(JSON.stringify(doc)).length
  return {
    tiles,
    rows: tiles.reduce((sum, tile) => sum + tile.rows, 0),
    bytes,
    tooBig: bytes > MAX_SHARED_BYTES,
  }
}

/** The tiles that make an upload too big, largest first (what to remove). */
export function largestTiles(dashboard: Dashboard, count = 3): { title: string; bytes: number }[] {
  return toSharedDoc(dashboard)
    .tiles.map((tile) => ({
      title: tile.title,
      bytes: new TextEncoder().encode(JSON.stringify(tile)).length,
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, count)
}

// ---- What comes back from the account service (checked, it's another system's data) ----

export const RoleSchema = z.enum(['owner', 'editor', 'viewer'])
export type Role = z.infer<typeof RoleSchema>

/** A dashboard opened from the account: by link, or as its owner or a member. */
export const SharedDashboardSchema = z.object({
  name: z.string(),
  doc: DashboardSchema,
  ownerName: z.string(),
  updatedAt: z.string(),
})
export type SharedDashboard = z.infer<typeof SharedDashboardSchema>

export const MemberDashboardSchema = SharedDashboardSchema.extend({
  id: z.string(),
  version: z.number().int(),
  role: RoleSchema,
})
export type MemberDashboard = z.infer<typeof MemberDashboardSchema>

export const SharedEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerName: z.string(),
  role: z.enum(['editor', 'viewer']),
  updatedAt: z.string(),
})
export type SharedEntry = z.infer<typeof SharedEntrySchema>

export const PersonSchema = z.object({
  kind: z.enum(['member', 'invite']),
  userId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['editor', 'viewer']),
})
export type Person = z.infer<typeof PersonSchema>

export const ShareLinkSchema = z.object({
  slug: z.string(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
})
export type ShareLink = z.infer<typeof ShareLinkSchema>

/** A link that still opens the dashboard. */
export function linkIsLive(link: ShareLink, now = Date.now()): boolean {
  return link.revokedAt === null && (link.expiresAt === null || Date.parse(link.expiresAt) > now)
}

/** "someone@Example.com " → "someone@example.com"; null when it isn't an address. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

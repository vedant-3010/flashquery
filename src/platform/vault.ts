import { AppError } from '@/lib/errors'
import { z } from '@/lib/zod'
import type { VaultKeys } from '@/lib/vault'
import { accountError } from '@/platform/errors'
import { accountClient as client } from '@/platform/supabase'

// The encrypted workspace's calls (M17, F-SYNC-01…06, D123). Everything sent here was encrypted in
// the browser first (src/lib/vault.ts, by src/stores/sync.ts): the wrapped key, base64 records and
// encrypted file chunks. Lazy, like the rest of src/platform/: reached only through
// src/stores/sync.ts (lint). Row-level security (supabase/migrations/…_vault.sql) keeps each
// person to their own rows and storage folder.

const BUCKET = 'vault'
const PAGE = 1000

const WrappedSchema = z.object({ iv: z.string(), data: z.string() })
const VaultRowSchema = z.object({
  kdf: z.object({
    alg: z.literal('PBKDF2-SHA256'),
    iterations: z.number().int(),
    salt: z.string(),
  }),
  wrapped_key: WrappedSchema,
  recovery_wrapped_key: WrappedSchema,
  created_at: z.string(),
})

export interface Vault {
  keys: VaultKeys
  /** When it was set up: a vault deleted and set up again has another data key. */
  createdAt: string
}

const toVault = (row: z.infer<typeof VaultRowSchema>): Vault => ({
  keys: { kdf: row.kdf, wrapped: row.wrapped_key, recoveryWrapped: row.recovery_wrapped_key },
  createdAt: row.created_at,
})

/** True for "this deployment has no encrypted workspace" (the migration isn't applied). */
export function isMissingService(error: unknown): boolean {
  const raw = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  return raw.code === 'PGRST205' || raw.code === '42P01' || raw.code === 'PGRST202'
}

function vaultError(error: unknown): AppError {
  if (isMissingService(error)) {
    return new AppError({
      code: 'vault_unavailable',
      message: 'Saving to your account isn’t set up on this deployment.',
      detail: String((error as { message?: unknown }).message ?? ''),
    })
  }
  const raw = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  if (raw.code === 'P0001' && String(raw.message).includes('storage_full')) return storageFull()
  if (raw.code === 'P0001' && String(raw.message).includes('vault_missing')) {
    return new AppError({
      code: 'vault_missing',
      message: 'Your saved workspace was deleted from another device.',
      detail: null,
    })
  }
  return accountError(error)
}

export const storageFull = () =>
  new AppError({
    code: 'storage_full',
    message: 'Your account’s storage is full. Upgrade, or remove files you no longer need.',
    detail: null,
  })

/** The signed-in user's id (storage paths start with it). */
export async function currentUserId(): Promise<string> {
  const { data, error } = await client().auth.getSession()
  if (error) throw accountError(error)
  const id = data.session?.user.id
  if (!id) throw new AppError({ code: 'not_signed_in', message: 'Sign in first.', detail: null })
  return id
}

// ---- The vault: the wrapped data key -------------------------------------------------------

/** The account's vault, or null before it's set up. */
export async function loadVault(): Promise<Vault | null> {
  const { data, error } = await client()
    .from('vaults')
    .select('kdf, wrapped_key, recovery_wrapped_key, created_at')
    .maybeSingle()
  if (error) throw vaultError(error)
  return data === null ? null : toVault(VaultRowSchema.parse(data))
}

export async function createVault(keys: VaultKeys): Promise<Vault> {
  const { data, error } = await client()
    .from('vaults')
    .insert({
      kdf: keys.kdf,
      wrapped_key: keys.wrapped,
      recovery_wrapped_key: keys.recoveryWrapped,
    })
    .select('kdf, wrapped_key, recovery_wrapped_key, created_at')
    .single()
  if (error) throw vaultError(error)
  return toVault(VaultRowSchema.parse(data))
}

/** A new passphrase or recovery key: the same data key, wrapped again. */
export async function saveVaultKeys(keys: VaultKeys): Promise<void> {
  const { error } = await client()
    .from('vaults')
    .update({
      kdf: keys.kdf,
      wrapped_key: keys.wrapped,
      recovery_wrapped_key: keys.recoveryWrapped,
      updated_at: new Date().toISOString(),
    })
    .not('user_id', 'is', null)
  if (error) throw vaultError(error)
}

// ---- Records -------------------------------------------------------------------------------

const RecordRowSchema = z.object({
  scope: z.string(),
  key: z.string(),
  version: z.number().int(),
  ciphertext: z.string(),
  updated_at: z.string(),
})

export interface RemoteRecord {
  scope: string
  key: string
  version: number
  ciphertext: string
  /** The service's clock (the pull cursor). */
  updatedAt: string
}

const toRecord = (row: z.infer<typeof RecordRowSchema>): RemoteRecord => ({
  scope: row.scope,
  key: row.key,
  version: row.version,
  ciphertext: row.ciphertext,
  updatedAt: row.updated_at,
})

/**
 * Saves a record if nobody saved it since version `expected` (0: new). Returns the new version, or
 * null when another device got there first.
 */
export async function putRecord(
  scope: string,
  key: string,
  expected: number,
  sealed: string,
): Promise<number | null> {
  const { data, error } = await client().rpc('sync_put', {
    record_scope: scope,
    record_key: key,
    expected,
    sealed,
  })
  if (error) throw vaultError(error)
  return z.number().int().nullable().parse(data)
}

/** One record as the account has it, or null. */
export async function getRecord(scope: string, key: string): Promise<RemoteRecord | null> {
  const { data, error } = await client()
    .from('sync_records')
    .select('scope, key, version, ciphertext, updated_at')
    .eq('scope', scope)
    .eq('key', key)
    .maybeSingle()
  if (error) throw vaultError(error)
  return data === null ? null : toRecord(RecordRowSchema.parse(data))
}

const ChangeRowSchema = RecordRowSchema.omit({ ciphertext: true })
export type RemoteChange = Omit<RemoteRecord, 'ciphertext'>

/**
 * What changed since `since` (the service's clock; null: everything), oldest first: names and
 * versions only, so the sync downloads just the records it doesn't have.
 */
export async function pullChanges(since: string | null): Promise<RemoteChange[]> {
  const changes: RemoteChange[] = []
  for (let from = 0; ; from += PAGE) {
    let query = client()
      .from('sync_records')
      .select('scope, key, version, updated_at')
      .order('updated_at')
      .order('scope')
      .order('key')
      .range(from, from + PAGE - 1)
    if (since !== null) query = query.gte('updated_at', since)
    const { data, error } = await query
    if (error) throw vaultError(error)
    const page = z.array(ChangeRowSchema).parse(data)
    changes.push(
      ...page.map((row) => ({
        scope: row.scope,
        key: row.key,
        version: row.version,
        updatedAt: row.updated_at,
      })),
    )
    if (page.length < PAGE) return changes
  }
}

/** Deletes a project's records from the account (deleted, or kept on one device only). */
export async function deleteRecords(scope: string): Promise<void> {
  const { error } = await client().from('sync_records').delete().eq('scope', scope)
  if (error) throw vaultError(error)
}

// ---- Files ---------------------------------------------------------------------------------

const ReservationSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  used: z.number(),
  limit: z.number(),
})
const UsageSchema = z.object({ used: z.number(), limit: z.number() })
export type StorageUsage = z.infer<typeof UsageSchema>

/** Reserves a file's space within the plan; `storage_full` past it. */
export async function reserveFile(
  fileId: string,
  bytes: number,
  chunks: number,
): Promise<StorageUsage> {
  const { data, error } = await client().rpc('vault_reserve', {
    file: fileId,
    file_bytes: bytes,
    file_chunks: chunks,
  })
  if (error) throw vaultError(error)
  const reservation = ReservationSchema.parse(data)
  if (!reservation.ok) throw storageFull()
  return { used: reservation.used, limit: reservation.limit }
}

const chunkPath = (userId: string, fileId: string, index: number) => `${userId}/${fileId}/${index}`

function isAlreadyThere(error: unknown): boolean {
  const raw = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  return raw.statusCode === '409' || /already exists|duplicate/i.test(String(raw.message))
}

/** Uploads one encrypted chunk; one already there (an upload resumed) counts as done. */
export async function uploadChunk(
  userId: string,
  fileId: string,
  index: number,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const { error } = await client()
    .storage.from(BUCKET)
    .upload(chunkPath(userId, fileId, index), sealed, {
      upsert: false,
      contentType: 'application/octet-stream',
    })
  if (error && !isAlreadyThere(error)) throw accountError(error)
}

export async function downloadChunk(
  userId: string,
  fileId: string,
  index: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const { data, error } = await client()
    .storage.from(BUCKET)
    .download(chunkPath(userId, fileId, index), {}, signal ? { signal } : undefined)
  if (error) throw accountError(error)
  return new Uint8Array(await data.arrayBuffer())
}

const FileRowSchema = z.object({
  file_id: z.string(),
  chunks: z.number().int(),
  created_at: z.string(),
})

/** The files saved to the account (their ids, chunk counts and when they were reserved). */
export async function listFiles(): Promise<
  { fileId: string; chunks: number; createdAt: number }[]
> {
  const { data, error } = await client().from('vault_files').select('file_id, chunks, created_at')
  if (error) throw vaultError(error)
  return z
    .array(FileRowSchema)
    .parse(data)
    .map((row) => ({
      fileId: row.file_id,
      chunks: row.chunks,
      createdAt: Date.parse(row.created_at),
    }))
}

/** Deletes a file's chunks, then its reservation (so its space is free again). */
export async function deleteFile(userId: string, fileId: string, chunks: number): Promise<void> {
  const paths = Array.from({ length: chunks }, (_, index) => chunkPath(userId, fileId, index))
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await client()
      .storage.from(BUCKET)
      .remove(paths.slice(i, i + 1000))
    if (error) throw accountError(error)
  }
  const { error } = await client().from('vault_files').delete().eq('file_id', fileId)
  if (error) throw vaultError(error)
}

/** Storage used of the plan's limit (Settings → Sync). */
export async function storageUsage(): Promise<StorageUsage> {
  const { data, error } = await client().rpc('vault_usage')
  if (error) throw vaultError(error)
  return UsageSchema.parse(data)
}

/**
 * Deletes everything saved to the account: files, records and the vault itself ("Delete cloud
 * copy", and before deleting the account: storage isn't removed with the account's rows).
 */
export async function deleteEverything(): Promise<void> {
  const userId = await currentUserId()
  // The vault first: from then on, no device can save records (sync_put needs it).
  const vault = await client().from('vaults').delete().not('user_id', 'is', null)
  if (vault.error) throw vaultError(vault.error)
  const records = await client().from('sync_records').delete().not('key', 'is', null)
  if (records.error) throw vaultError(records.error)
  for (const file of await listFiles()) await deleteFile(userId, file.fileId, file.chunks)
}

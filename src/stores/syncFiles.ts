import { AppError, toAppError } from '@/lib/errors'
import { idbStore, parseEnvelope, readEnvelope } from '@/lib/idb'
import { unreferencedFiles } from '@/lib/syncMerge'
import { chunkAad, chunkCount, decryptChunk, encryptChunk, sealedBytes } from '@/lib/vault'
import { PERSISTED_RECORD } from '@/stores/keptDatasets'
import type { FileTransfer } from '@/stores/persistFiles'

// Kept files in the account (M17, F-SYNC-04): encrypted here in 4 MiB chunks, each its own object
// bound to its file and place (src/lib/vault.ts), uploaded and downloaded a few at a time. Used by
// src/stores/sync.ts; the calls are src/platform/vault.ts.

type Api = typeof import('@/platform/vault')

const PARALLEL = 3
/** Unreferenced files are deleted after a week: another device may still be saving its list. */
const GRACE_MS = 7 * 24 * 60 * 60 * 1000

/** Runs `task(i)` for i in 0..count-1, `PARALLEL` at a time. */
async function eachChunk(count: number, task: (index: number) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < count) {
      const index = next
      next += 1
      await task(index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, count) }, worker))
}

/** A call tried up to 3 times (a dropped connection mid-file shouldn't restart it). */
async function retried<T>(call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call()
    } catch (error) {
      if (attempt >= 2 || signal?.aborted || toAppError(error).code === 'storage_full') throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * 4 ** attempt))
    }
  }
}

export function fileTransfer({
  api,
  key,
  userId,
  onBusy,
  onFailed,
}: {
  api: Api
  key: CryptoKey
  userId: string
  /** Uploads under way (the status pill says "Saving files"). */
  onBusy: (uploads: number) => void
  onFailed: (error: unknown) => void
}): FileTransfer {
  let uploads = 0
  return {
    upload: async (file, fileId) => {
      onBusy((uploads += 1))
      try {
        const chunks = chunkCount(file.size)
        const bytes = sealedBytes(file.size)
        await api.reserveFile(fileId, bytes, chunks)
        await eachChunk(chunks, async (index) => {
          const sealed = await encryptChunk(
            key,
            file,
            index,
            chunkAad(userId, fileId, index, chunks),
          )
          await retried(() => api.uploadChunk(userId, fileId, index, sealed))
        })
        return { fileId, bytes, chunks }
      } finally {
        onBusy((uploads -= 1))
      }
    },
    download: async (cloud, onProgress, signal) => {
      const parts: ArrayBuffer[] = []
      let done = 0
      await eachChunk(cloud.chunks, async (index) => {
        signal.throwIfAborted()
        const sealed = await retried(
          () => api.downloadChunk(userId, cloud.fileId, index, signal),
          signal,
        )
        parts[index] = await decryptChunk(
          key,
          sealed,
          chunkAad(userId, cloud.fileId, index, cloud.chunks),
        )
        done += 1
        onProgress(done / cloud.chunks)
      })
      if (parts.length !== cloud.chunks) {
        throw new AppError({ code: 'download_failed', message: 'A part is missing.', detail: null })
      }
      return new Blob(parts)
    },
    failed: onFailed,
  }
}

/**
 * Deletes files in the account that no file list mentions (left by a removal made offline, or an
 * upload cut short), unless they may belong to a project this device doesn't sync.
 */
export async function collectUnreferencedFiles({
  api,
  userId,
  projectIds,
  syncable,
}: {
  api: Api
  userId: string
  /** Every project this device knows. */
  projectIds: readonly string[]
  syncable: (projectId: string) => boolean
}): Promise<number> {
  const referenced = new Set<string>()
  for (const localKey of await idbStore.keys()) {
    const projectId = localKey.match(/^p:(.+):persistedDatasets$/)?.[1]
    if (!projectId) continue
    const parsed = parseEnvelope(PERSISTED_RECORD, await readEnvelope(localKey))
    if (!parsed.ok) continue
    for (const entry of parsed.data) if (entry.cloud) referenced.add(entry.cloud.fileId)
  }
  const files = await api.listFiles()
  const owner = (fileId: string) => projectIds.find((id) => fileId.startsWith(`${id}-`))
  let deleted = 0
  for (const fileId of unreferencedFiles(files, referenced, Date.now(), GRACE_MS)) {
    const project = owner(fileId)
    if (project !== undefined && !syncable(project)) continue
    const chunks = files.find((file) => file.fileId === fileId)?.chunks ?? 1
    await api.deleteFile(userId, fileId, chunks)
    deleted += 1
  }
  return deleted
}

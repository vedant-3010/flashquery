import { isTryProject } from '@/app/tryDemo'
import { AppError, toAppError, type AppErrorData } from '@/lib/errors'
import { loadRecord, saveRecord } from '@/lib/idb'
import {
  createVault,
  rewrapWithNewRecoveryKey,
  rewrapWithPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from '@/lib/vault'
import type { StorageUsage, Vault } from '@/platform/vault'
import { forgetCloudCopies, setCloudFiles } from '@/stores/persistFiles'
import { useProjectsStore, type Project } from '@/stores/projects'
import type { SyncEngine } from '@/stores/syncEngine'
import { newMeta, SYNC_META_RECORD, type SyncMeta } from '@/stores/syncMeta'
import { createAppEngine } from '@/stores/syncHost'
import { collectUnreferencedFiles, fileTransfer } from '@/stores/syncFiles'
import { forgetKey, rememberedKey, rememberKey } from '@/stores/vaultKey'

// The encrypted workspace's session (M17): the account's vault, the unlocked key and the running
// sync, with the flows that change them (set up, unlock, lock, new passphrase or recovery key,
// delete the cloud copy). src/stores/sync.ts holds what the UI shows and wires this to the app.

type Api = typeof import('@/platform/vault')

export type SyncStatus =
  /** Accounts are off, or nobody is signed in. */
  | 'off'
  /** This deployment has no encrypted workspace. */
  | 'unavailable'
  | 'checking'
  /** Signed in, nothing saved to the account yet. */
  | 'setup'
  /** Saved to the account; this device needs the passphrase or recovery key. */
  | 'locked'
  /** This browser's workspace saves to another account. */
  | 'other-account'
  | 'ready'
  | 'syncing'
  /** The last attempt failed (offline, …): tried again on focus and every minute. */
  | 'error'

/** What the session reports to the store. */
export interface SyncReport {
  status: SyncStatus
  error: AppErrorData | null
  lastSyncedAt: number | null
  storageFull: boolean
  usage: StorageUsage | null
  uploads: number
  dialog: 'setup' | 'unlock' | null
  changedElsewhere: boolean
  newerApp: boolean
  /** This browser's projects already save to the account (unlocking adds nothing new). */
  linked: boolean
}

const missing = (code: string, message: string) => new AppError({ code, message, detail: null })

export class SyncSession {
  private api: Api | null = null
  private userId: string | null = null
  private vault: Vault | null = null
  private meta: SyncMeta | null = null
  private engine: SyncEngine | null = null
  private dataKey: CryptoKey | null = null
  private pending: { key: CryptoKey; remember: boolean } | null = null
  private metaLoaded: Promise<void> = Promise.resolve()
  /** The project list is being merged from the account (not a change made here). */
  merging = false
  /** A file didn't upload (offline, the service down): shown until the next full sync retries it. */
  private uploadFailed: AppErrorData | null = null

  private readonly load: () => Promise<Api>
  private readonly report: (patch: Partial<SyncReport>) => void
  private readonly storageFull: () => boolean

  constructor(deps: {
    load: () => Promise<Api>
    report: (patch: Partial<SyncReport>) => void
    storageFull: () => boolean
  }) {
    this.load = deps.load
    this.report = deps.report
    this.storageFull = deps.storageFull
  }

  /** Reads which account this browser's workspace is linked to (no network). */
  readLink(): Promise<void> {
    this.metaLoaded = loadRecord(SYNC_META_RECORD)
      .then((saved) => {
        this.meta = saved
      })
      .catch((error: unknown) => console.warn('HushGlance: sync state could not be read', error))
    return this.metaLoaded
  }

  get unlocked(): boolean {
    return this.engine !== null
  }

  /** Whether project `id` saves to the account (this browser is linked, and it isn't kept here). */
  readonly syncsProject = (id: string): boolean => {
    if (this.meta === null || isTryProject(id)) return false
    const project = useProjectsStore.getState().projects.find((p) => p.id === id)
    return project !== undefined && !project.localOnly
  }

  private saveMeta() {
    return saveRecord(SYNC_META_RECORD, this.meta)
  }

  private needApi(): Api {
    if (!this.api) throw missing('not_signed_in', 'Sign in first.')
    return this.api
  }

  private needVault(): Vault {
    if (!this.vault) throw missing('vault_missing', 'Set up saving to your account first.')
    return this.vault
  }

  /** Tells kept files which projects sync, and how to move files while unlocked. */
  linkFiles(): void {
    const { api, dataKey, userId } = this
    setCloudFiles({
      synced: this.syncsProject,
      transfer:
        api && dataKey && userId
          ? fileTransfer({
              api,
              key: dataKey,
              userId,
              onBusy: (uploads) => this.report({ uploads }),
              onFailed: (error) => {
                const failure = toAppError(error)
                if (failure.code === 'storage_full') return this.report({ storageFull: true })
                this.uploadFailed = {
                  code: 'upload_failed',
                  message:
                    'A file couldn’t be saved to your account yet: it’s kept here and tried again.',
                  detail: failure.detail ?? failure.message,
                }
                this.report({ status: 'error', error: this.uploadFailed })
              },
            })
          : null,
    })
  }

  /** A local record was saved: true when it goes to the account. */
  changed(key: string): boolean {
    return this.engine?.changed(key) ?? false
  }

  async run(kind: 'sync' | 'flush'): Promise<void> {
    const current = this.engine
    if (!current) return
    this.report({ status: 'syncing' })
    try {
      // Deleted or set up again from another device: stop, and start over from the account.
      const vault = await this.needApi().loadVault()
      if (vault?.createdAt !== this.meta?.vaultCreatedAt) {
        this.stop('checking')
        return this.check()
      }
      await (kind === 'sync' ? current.sync() : current.flush())
      const failed = this.uploadFailed
      if (failed && kind === 'flush') {
        // Records saved, a file still isn't: keep saying so until the next full sync.
        this.report({ status: 'error', error: failed, lastSyncedAt: Date.now() })
      } else {
        this.report({ status: 'ready', error: null, lastSyncedAt: Date.now() })
        if (failed) {
          // The service answers again: files that didn't upload get another go.
          this.uploadFailed = null
          this.linkFiles()
        }
      }
    } catch (error) {
      const failure = toAppError(error, 'sync_failed', 'Couldn’t save to your account.')
      if (failure.code === 'vault_missing') {
        this.stop('checking')
        return this.check()
      }
      if (failure.code === 'vault_tampered') {
        // Saved with another key: the vault was set up again elsewhere. Unlock afresh.
        await forgetKey()
        this.stop('locked')
        return this.check()
      }
      if (failure.code === 'storage_full') this.report({ storageFull: true })
      this.report({ status: 'error', error: failure.toJSON() })
    } finally {
      this.report({ newerApp: current.newerApp })
      if (this.engine === current) await this.saveMeta()
    }
  }

  /** Syncs, or checks the account again after an error. */
  retry(): Promise<void> {
    return this.engine ? this.run('sync') : this.check()
  }

  /** Where this account's workspace stands (on sign-in, and after an error). */
  async check(): Promise<void> {
    this.report({ status: 'checking', error: null })
    try {
      const api = (this.api ??= await this.load())
      await this.metaLoaded
      const userId = (this.userId = await api.currentUserId())
      if (this.meta && this.meta.userId !== userId) return this.report({ status: 'other-account' })
      const vault = (this.vault = await api.loadVault())
      if (this.meta && this.meta.vaultCreatedAt !== vault?.createdAt) {
        // Deleted, or set up again, from another device: this device starts over.
        this.meta = null
        await this.saveMeta()
        await forgetKey()
        this.linkFiles()
      }
      this.report({ linked: this.meta !== null })
      if (!vault) return this.report({ status: 'setup' })
      const key = await rememberedKey(userId, vault.createdAt)
      if (key) return await this.begin(key)
      this.report({ status: 'locked' })
    } catch (error) {
      const failure = toAppError(error)
      if (failure.code === 'vault_unavailable') return this.report({ status: 'unavailable' })
      this.report({ status: 'error', error: failure.toJSON() })
    }
  }

  /**
   * Unlocked: links this device (resolves once that's saved here), then syncs in the background
   * (the first time, everything here goes up).
   */
  private async begin(key: CryptoKey): Promise<void> {
    const vault = this.needVault()
    const api = this.needApi()
    const owner = this.userId
    if (!owner) return
    await useProjectsStore.getState().hydrate()
    this.dataKey = key
    const meta = (this.meta ??= newMeta(owner, vault.createdAt))
    const engine = (this.engine = createAppEngine({
      api,
      owner,
      key,
      meta,
      setMerging: (merging) => {
        this.merging = merging
      },
      onChangedElsewhere: () => this.report({ changedElsewhere: true }),
    }))
    await this.saveMeta()
    await engine.scan()
    this.report({ status: 'ready', dialog: null, error: null, linked: true })
    this.linkFiles()
    // Linked and saved here: the first sync runs on (a reload now loses nothing).
    void this.run('sync').then(() => {
      void this.refreshUsage()
      void collectUnreferencedFiles({
        api,
        userId: owner,
        projectIds: useProjectsStore.getState().projects.map((p) => p.id),
        syncable: this.syncsProject,
      }).catch((error: unknown) =>
        console.warn('HushGlance: clean-up of saved files failed', error),
      )
    })
  }

  stop(status: SyncStatus): void {
    this.engine = null
    this.dataKey = null
    this.linkFiles()
    this.report({ status, uploads: 0, usage: null })
  }

  /** A new vault; returns the recovery key to show (saving starts with finishSetUp). */
  async setUp(passphrase: string, remember: boolean): Promise<string> {
    const created = await createVault(passphrase)
    // Anything left in the account without a vault (a deletion cut short) can't be read: clear it.
    await this.needApi().deleteEverything()
    try {
      this.vault = await this.needApi().createVault(created.keys)
    } catch (error) {
      if (!/23505|duplicate/i.test(toAppError(error).detail ?? '')) throw error
      await this.check()
      throw missing(
        'vault_exists',
        'Your workspace was just set up on another device. Unlock it instead.',
      )
    }
    this.pending = { key: created.dataKey, remember }
    return created.recoveryKey
  }

  async finishSetUp(): Promise<void> {
    const setup = this.pending
    this.pending = null
    if (!setup || !this.userId || !this.vault) return
    if (setup.remember) {
      await rememberKey({
        userId: this.userId,
        vaultCreatedAt: this.vault.createdAt,
        key: setup.key,
      })
    }
    await this.begin(setup.key)
  }

  /** With the passphrase, or the recovery key (then `newPassphrase` replaces the forgotten one). */
  async unlock(
    secret: { passphrase: string } | { recoveryKey: string; newPassphrase: string },
    remember: boolean,
  ): Promise<void> {
    const vault = this.needVault()
    let key: CryptoKey
    if ('passphrase' in secret) {
      key = await unlockWithPassphrase(vault.keys, secret.passphrase)
    } else {
      const material = await unlockWithRecoveryKey(vault.keys, secret.recoveryKey, {
        extractable: true,
      })
      const keys = await rewrapWithPassphrase(vault.keys, material, secret.newPassphrase)
      await this.needApi().saveVaultKeys(keys)
      this.vault = { ...vault, keys }
      key = await unlockWithPassphrase(keys, secret.newPassphrase)
    }
    if (remember && this.userId) {
      await rememberKey({ userId: this.userId, vaultCreatedAt: vault.createdAt, key })
    }
    await this.begin(key)
  }

  async lock(): Promise<void> {
    await forgetKey()
    this.stop(this.vault ? 'locked' : 'setup')
  }

  async changePassphrase(current: string, next: string): Promise<void> {
    const vault = this.needVault()
    const material = await unlockWithPassphrase(vault.keys, current, { extractable: true })
    const keys = await rewrapWithPassphrase(vault.keys, material, next)
    await this.needApi().saveVaultKeys(keys)
    this.vault = { ...vault, keys }
  }

  async newRecoveryKey(passphrase: string): Promise<string> {
    const vault = this.needVault()
    const material = await unlockWithPassphrase(vault.keys, passphrase, { extractable: true })
    const renewed = await rewrapWithNewRecoveryKey(vault.keys, material)
    await this.needApi().saveVaultKeys(renewed.keys)
    this.vault = { ...vault, keys: renewed.keys }
    return renewed.recoveryKey
  }

  /** Deletes everything saved to the account; this device keeps its copy. */
  async deleteCloudCopy(): Promise<void> {
    await this.needApi().deleteEverything()
    await this.unlink()
    // Files kept here no longer have a copy in the account: a new setup uploads them again.
    for (const project of useProjectsStore.getState().projects) {
      await forgetCloudCopies(project.id)
    }
    this.stop('setup')
  }

  /** This browser's workspace no longer saves to any account (deleted, or the account went). */
  async unlink(): Promise<void> {
    this.vault = null
    this.meta = null
    this.report({ linked: false })
    await this.saveMeta()
    await forgetKey()
  }

  async refreshUsage(): Promise<void> {
    if (!this.api || !this.engine) return
    try {
      const usage = await this.api.storageUsage()
      this.report({ usage, storageFull: this.storageFull() && usage.used >= usage.limit * 0.98 })
    } catch (error) {
      console.warn('HushGlance: storage use is unavailable', toAppError(error).message)
    }
  }

  /** Project changes made here: deletions and "Keep on this device only" reach the account. */
  projectsChanged(
    state: { projects: Project[]; removed: { id: string; kind: string }[] },
    previous: { projects: Project[]; removed: { id: string; kind: string }[] },
  ): void {
    const meta = this.meta
    if (this.merging || !meta) return
    for (const project of state.projects) {
      const before = previous.projects.find((p) => p.id === project.id)
      if (before && before.localOnly !== project.localOnly) {
        void this.projectMoved(project.id, project.localOnly)
      }
    }
    for (const marker of state.removed) {
      if (marker.kind !== 'deleted' || previous.removed.includes(marker)) continue
      if (isTryProject(marker.id)) continue
      if (!meta.forget.includes(marker.id)) meta.forget.push(marker.id)
      this.engine?.forgetProject(marker.id)
    }
  }

  /** "Keep on this device only" turned on (the account's copy goes) or off (it saves again). */
  private async projectMoved(projectId: string, localOnly: boolean): Promise<void> {
    const meta = this.meta
    if (!meta) return
    if (localOnly) {
      // Its files in the account go too, including any uploaded since its list was last saved.
      const copies = await forgetCloudCopies(projectId)
      const known = meta.files[projectId] ?? []
      meta.files[projectId] = [
        ...known,
        ...copies
          .filter((copy) => !known.some((file) => file.fileId === copy.fileId))
          .map((copy) => ({ fileId: copy.fileId, chunks: copy.chunks })),
      ]
      if (!meta.forget.includes(projectId)) meta.forget.push(projectId)
      this.engine?.forgetProject(projectId)
    } else {
      meta.forget = meta.forget.filter((id) => id !== projectId)
      await this.engine?.scan()
    }
    await this.saveMeta()
    this.linkFiles()
    await this.run('sync')
  }
}

import { create } from 'zustand'
import { onRecordSaved } from '@/lib/idb'
import { useAuthStore } from '@/stores/auth'
import { useProjectsStore } from '@/stores/projects'
import { SyncSession, type SyncReport, type SyncStatus } from '@/stores/syncSession'
import { forgetKey } from '@/stores/vaultKey'

// The encrypted workspace (M17, F-SYNC-01…06, D123): a signed-in user's projects, questions,
// dashboards, notes and kept files, saved to their account so they can work on any device.
// Encrypted here before anything leaves (src/lib/vault.ts); the account service can't read it.
// This store is the only way to src/platform/vault.ts (lint), loaded for signed-in users only.
// Projects marked "Keep on this device only" and the try projects never sync.

export type { SyncStatus }

interface SyncState extends SyncReport {
  /** Setup or unlock was offered on this page ("Not now" doesn't ask again until a reload). */
  asked: boolean
  openDialog: (dialog: 'setup' | 'unlock') => void
  closeDialog: () => void
  /** A new vault; returns the recovery key to show (saving starts with finishSetUp). */
  setUp: (passphrase: string, remember: boolean) => Promise<string>
  finishSetUp: () => Promise<void>
  /** With the passphrase, or the recovery key (then `newPassphrase` replaces the forgotten one). */
  unlock: (
    secret: { passphrase: string } | { recoveryKey: string; newPassphrase: string },
    remember: boolean,
  ) => Promise<void>
  lock: () => Promise<void>
  changePassphrase: (current: string, next: string) => Promise<void>
  newRecoveryKey: (passphrase: string) => Promise<string>
  /** Deletes everything saved to the account; this device keeps its copy. */
  deleteCloudCopy: () => Promise<void>
  /** Syncs now, or checks the account again after an error. */
  retry: () => Promise<void>
  refreshUsage: () => Promise<void>
  dismissStorageFull: () => void
  /** After the account was deleted: this browser's workspace belongs to nobody now. */
  accountDeleted: () => Promise<void>
}

const session: SyncSession = new SyncSession({
  load: () => import('@/platform/vault'),
  report: (patch): void => useSyncStore.setState(patch),
  storageFull: (): boolean => useSyncStore.getState().storageFull,
})

/** Whether project `id` saves to the account (Home's badges, the project menu). */
export const syncsProject = (id: string): boolean => session.syncsProject(id)

export const useSyncStore = create<SyncState>()((set) => ({
  status: 'off',
  error: null,
  lastSyncedAt: null,
  storageFull: false,
  usage: null,
  uploads: 0,
  dialog: null,
  asked: false,
  changedElsewhere: false,
  newerApp: false,
  linked: false,
  openDialog: (dialog) => set({ dialog, asked: true }),
  closeDialog: () => set({ dialog: null, asked: true }),
  setUp: (passphrase, remember) => session.setUp(passphrase, remember),
  finishSetUp: () => session.finishSetUp(),
  unlock: (secret, remember) => session.unlock(secret, remember),
  lock: () => session.lock(),
  changePassphrase: (current, next) => session.changePassphrase(current, next),
  newRecoveryKey: (passphrase) => session.newRecoveryKey(passphrase),
  deleteCloudCopy: async () => {
    await session.deleteCloudCopy()
    set({ asked: true, storageFull: false, lastSyncedAt: null })
  },
  retry: () => session.retry(),
  refreshUsage: () => session.refreshUsage(),
  dismissStorageFull: () => set({ storageFull: false }),
  accountDeleted: async () => {
    await session.unlink()
    session.stop('off')
  },
}))

const PUSH_DELAY_MS = 3_000
const PULL_EVERY_MS = 60_000

let started = false

/** Once, at app start: follows the account, saves changes, pulls on focus and every minute. */
export function startSync(): void {
  if (started) return
  started = true
  // Which projects keep their files is known before anyone signs in (this browser is linked).
  void Promise.all([session.readLink(), useProjectsStore.getState().hydrate()]).then(() =>
    session.linkFiles(),
  )

  const follow = (status: string) => {
    if (status === 'signed-in') void session.check()
    else if (status === 'guest' || status === 'off') {
      // Signed out: the remembered key goes; this browser stays linked to the account.
      void forgetKey()
      session.stop('off')
    }
  }
  follow(useAuthStore.getState().status)
  useAuthStore.subscribe((state, previous) => {
    if (state.status !== previous.status) follow(state.status)
  })

  let pushTimer: ReturnType<typeof setTimeout> | null = null
  onRecordSaved((key) => {
    if (!session.changed(key)) return
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => {
      pushTimer = null
      void session.run('flush')
    }, PUSH_DELAY_MS)
  })

  useProjectsStore.subscribe((state, previous) => {
    if (state.projects !== previous.projects || state.removed !== previous.removed) {
      session.projectsChanged(state, previous)
    }
  })

  const pull = () => {
    const { status } = useSyncStore.getState()
    if (status === 'ready' || status === 'error') void session.retry()
  }
  window.addEventListener('focus', pull)
  setInterval(() => {
    if (document.visibilityState === 'visible') pull()
  }, PULL_EVERY_MS)
}

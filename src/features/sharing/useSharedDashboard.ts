import { useEffect, useState } from 'react'
import type { Role } from '@/dashboard/cloud'
import type { Dashboard } from '@/dashboard/schema'
import { toAppError, type AppErrorData } from '@/lib/errors'
import { sharing } from '@/stores/sharing'

/** Where a shared dashboard comes from: a view-only link, or the account (owner or member). */
export type SharedSource = { kind: 'link'; slug: string } | { kind: 'member'; id: string }

export interface OpenedDashboard {
  name: string
  doc: Dashboard
  ownerName: string
  updatedAt: string
  /** Opened through the account: its id, the version read (to save against) and your role. */
  member: { id: string; version: number; role: Role } | null
}

type State =
  | { status: 'loading' }
  | { status: 'error'; error: AppErrorData }
  | { status: 'ready'; shared: OpenedDashboard }

async function open(source: SharedSource): Promise<OpenedDashboard> {
  const api = await sharing()
  if (source.kind === 'link') return { ...(await api.openLink(source.slug)), member: null }
  const { id, version, role, ...opened } = await api.openMember(source.id)
  return { ...opened, member: { id, version, role } }
}

/** Opens a shared dashboard (F-SHARE-04/05) and keeps it; `replace` after a save. */
export function useSharedDashboard(source: SharedSource) {
  const [state, setState] = useState<State>({ status: 'loading' })
  /** Bumped to read it again. */
  const [attempt, setAttempt] = useState(0)
  const kind = source.kind
  const key = source.kind === 'link' ? source.slug : source.id

  useEffect(() => {
    let current = true
    const from: SharedSource = kind === 'link' ? { kind, slug: key } : { kind, id: key }
    open(from).then(
      (shared) => current && setState({ status: 'ready', shared }),
      (cause: unknown) => current && setState({ status: 'error', error: toAppError(cause) }),
    )
    return () => {
      current = false
    }
  }, [kind, key, attempt])

  return {
    state,
    reload: () => {
      setState({ status: 'loading' })
      setAttempt((n) => n + 1)
    },
    replace: (shared: OpenedDashboard) => setState({ status: 'ready', shared }),
  }
}

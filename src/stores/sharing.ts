import { toSharedDoc } from '@/dashboard/cloud'
import type { CloudLink } from '@/dashboard/schema'
import { AppError } from '@/lib/errors'
import { flushDashboardSave, useDashboardStore } from '@/stores/dashboard'

// Sharing (F-SHARE-01…07). The calls live in src/platform/sharing.ts, loaded with the account
// service on first use: only a signed-in owner sharing, or someone opening a shared dashboard,
// downloads it (D114). This module is the only way in from the app (lint enforces it), and it keeps
// the local dashboard linked to its shared copy.

const platform = () => import('@/platform/sharing')

/** The sharing calls (a lazy chunk). */
export const sharing = platform

const dashboards = () => useDashboardStore.getState()

function localDashboard(id: string) {
  const dashboard = dashboards().dashboards.find((d) => d.id === id)
  if (!dashboard) {
    throw new AppError({ code: 'share_missing', message: 'That dashboard is gone.', detail: id })
  }
  return dashboard
}

/** Remembers the shared copy at once: a reload must not share the dashboard a second time. */
function link(dashboardId: string, cloud: CloudLink | null) {
  dashboards().setCloud(dashboardId, cloud)
  flushDashboardSave()
}

/**
 * Uploads the dashboard after the consent dialog (F-SHARE-01/02): a new shared copy, or over the
 * existing one if it's still at the version this device saved (F-SHARE-07; `force` saves over an
 * editor's changes). Throws 'share_conflict' or 'share_gone' for the dialog to ask about.
 */
export async function publishDashboard(
  dashboardId: string,
  { force = false }: { force?: boolean } = {},
): Promise<CloudLink> {
  const dashboard = localDashboard(dashboardId)
  const doc = toSharedDoc(dashboard)
  const api = await platform()
  const saved = dashboard.cloud
    ? await api.updateDashboard(dashboard.cloud.id, doc, force ? null : dashboard.cloud.version)
    : await api.saveDashboard(doc)
  const cloud = { id: saved.id, version: saved.version, savedAt: Date.now() }
  link(dashboardId, cloud)
  return cloud
}

/** Stops sharing (the shared copy, its people and links are deleted); the dashboard stays here. */
export async function unpublishDashboard(dashboardId: string): Promise<void> {
  const cloud = localDashboard(dashboardId).cloud
  if (cloud) await (await platform()).deleteDashboard(cloud.id)
  link(dashboardId, null)
}

/** The shared copy is gone (deleted elsewhere, or another account's): share this one afresh. */
export function forgetSharedCopy(dashboardId: string): void {
  link(dashboardId, null)
}

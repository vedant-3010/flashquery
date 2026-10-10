import { LoaderCircle, Pencil, RotateCcw, Save, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { paths } from '@/app/paths'
import { Toaster } from '@/components/Toaster'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Dashboard } from '@/dashboard/schema'
import { FormError } from '@/features/account/FormError'
import { DashboardPaletteContext } from '@/features/charts/chartPalette'
import { EditSharedTileDialog } from '@/features/sharing/EditSharedTileDialog'
import { ShareDialog } from '@/features/sharing/ShareDialog'
import { SharedFrame } from '@/features/sharing/SharedFrame'
import { SharedMessage } from '@/features/sharing/SharedMessage'
import { SharedGrid } from '@/features/sharing/SharedGrid'
import { useSharedDashboard, type SharedSource } from '@/features/sharing/useSharedDashboard'
import { toAppError, type AppErrorData } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { sharing } from '@/stores/sharing'
import { useToastStore } from '@/stores/toast'

/**
 * A shared dashboard (F-SHARE-04…06): `/app/s/:slug` for anyone with the link, `/app/shared/:id`
 * for its owner and members. Snapshots only, so it needs no file and no key. Editors (and the owner)
 * arrange tiles and edit titles and text, saving against the version they opened.
 */
export function SharedDashboardPage({ source }: { source: SharedSource }) {
  const { state, reload, replace } = useSharedDashboard(source)
  const toast = useToastStore((s) => s.show)
  const accountId = useAuthStore((s) => s.account?.id ?? null)
  const [, navigate] = useLocation()
  const [draft, setDraft] = useState<Dashboard | null>(null)
  const [tileId, setTileId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [managing, setManaging] = useState(false)
  const [error, setError] = useState<AppErrorData | null>(null)
  const name = state.status === 'ready' ? state.shared.name : null

  useEffect(() => {
    document.title = name ? `${name} · flashQuery` : 'Shared dashboard · flashQuery'
  }, [name])

  if (state.status === 'loading') {
    return (
      <SharedFrame>
        <div className="grid gap-4" aria-busy="true" aria-label="Opening the dashboard">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        </div>
      </SharedFrame>
    )
  }

  if (state.status === 'error') {
    const { code } = state.error
    return code === 'share_unavailable' ? (
      <SharedMessage
        title="This dashboard is no longer shared"
        description="The link was revoked or has expired, or the dashboard was deleted. Ask whoever shared it for a new link."
      />
    ) : code === 'share_gone' ? (
      <SharedMessage
        title="You don’t have access to this dashboard"
        description="It was deleted, or its owner stopped sharing it with you."
      />
    ) : (
      <SharedMessage title="Couldn’t open this dashboard" description={state.error.message}>
        <Button variant="outline" size="sm" onClick={reload}>
          <RotateCcw aria-hidden />
          Try again
        </Button>
      </SharedMessage>
    )
  }

  const { shared } = state
  const member = shared.member
  const canEdit = member?.role === 'owner' || member?.role === 'editor'
  const shown = draft ?? shared.doc
  const editingTile = draft?.tiles.find((tile) => tile.id === tileId) ?? null

  const save = async (force = false) => {
    if (!draft || !member) return
    setSaving(true)
    setError(null)
    try {
      const doc = { ...draft, updatedAt: Date.now() }
      const saved = await (
        await sharing()
      ).updateDashboard(member.id, doc, force ? null : member.version)
      replace({
        ...shared,
        doc,
        updatedAt: new Date().toISOString(),
        member: { ...member, version: saved.version },
      })
      setDraft(null)
      toast('Saved. Everyone with access sees your changes.')
    } catch (cause) {
      const failure = toAppError(cause)
      if (failure.code === 'share_conflict') setConflict(true)
      else setError(failure)
    } finally {
      setSaving(false)
    }
  }

  const leave = async () => {
    if (!member || !accountId) return
    try {
      await (await sharing()).removeMember(member.id, accountId)
      toast(`You left ${shared.name}.`)
      navigate(paths.home)
    } catch (cause) {
      setError(toAppError(cause))
    }
  }

  return (
    <SharedFrame
      title={shown.name}
      ownerName={shared.ownerName}
      updatedAt={shared.updatedAt}
      role={member?.role ?? null}
      onLeave={member && member.role !== 'owner' ? () => void leave() : undefined}
      actions={
        draft ? (
          <>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => setDraft(null)}>
              Discard
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Save aria-hidden />
              )}
              Save changes
            </Button>
          </>
        ) : (
          <>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setDraft(shared.doc)}>
                <Pencil aria-hidden />
                Edit
              </Button>
            )}
            {member?.role === 'owner' && (
              <Button size="sm" variant="outline" onClick={() => setManaging(true)}>
                <Settings2 aria-hidden />
                Manage sharing
              </Button>
            )}
          </>
        )
      }
    >
      <FormError error={error} />
      {draft && (
        <p className="text-sm text-muted-foreground">
          Drag tiles by their handle and resize them from the corner, or use a tile’s menu to edit
          its title or text, size it or move it. Nobody sees the changes until you save.
        </p>
      )}
      <DashboardPaletteContext value={shown.palette ?? null}>
        <SharedGrid
          dashboard={shown}
          editing={draft !== null}
          onLayout={(layouts) =>
            setDraft((current) =>
              current
                ? {
                    ...current,
                    tiles: current.tiles.map((tile) => ({
                      ...tile,
                      layout: layouts.get(tile.id) ?? tile.layout,
                    })),
                  }
                : current,
            )
          }
          onEditTile={setTileId}
        />
      </DashboardPaletteContext>

      {editingTile && (
        <EditSharedTileDialog
          key={editingTile.id}
          tile={editingTile}
          onClose={() => setTileId(null)}
          onSave={(change) => {
            setDraft((current) =>
              current
                ? {
                    ...current,
                    tiles: current.tiles.map((tile) =>
                      tile.id === editingTile.id ? { ...tile, ...change } : tile,
                    ),
                  }
                : current,
            )
            setTileId(null)
          }}
        />
      )}

      <AlertDialog open={conflict} onOpenChange={setConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Someone saved a newer version</AlertDialogTitle>
            <AlertDialogDescription>
              Since you opened it, someone else changed this dashboard. Load their version (your
              changes are discarded), or save yours over it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDraft(null)
                reload()
              }}
            >
              Load their version
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void save(true)}>
              Save mine over it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {member?.role === 'owner' && (
        <ShareDialog
          open={managing}
          onOpenChange={setManaging}
          cloudId={member.id}
          name={shared.name}
          onStop={async () => {
            await (await sharing()).deleteDashboard(member.id)
            toast(`Stopped sharing ${shared.name}.`)
            navigate(paths.home)
          }}
        />
      )}
      <Toaster />
    </SharedFrame>
  )
}

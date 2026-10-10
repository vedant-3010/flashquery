import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { SharedEntry } from '@/dashboard/cloud'
import { FormError } from '@/features/account/FormError'
import { toAppError, type AppErrorData } from '@/lib/errors'
import { formatAgo } from '@/lib/format'
import type { OwnedEntry } from '@/platform/sharing'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { sharing } from '@/stores/sharing'

interface Lists {
  withMe: SharedEntry[]
  byMe: OwnedEntry[]
}

/**
 * Home's shared dashboards (F-SHARE-05), signed in only: those shared with you (new invites are
 * claimed first), and your own shared copies, so you can manage them from any device.
 */
export function SharedSection() {
  const accountId = useAuthStore((state) => state.account?.id ?? null)
  const locale = useSettingsStore((state) => state.locale)
  const [lists, setLists] = useState<Lists | null>(null)
  const [error, setError] = useState<AppErrorData | null>(null)

  useEffect(() => {
    if (!accountId) return
    let current = true
    void (async () => {
      try {
        const api = await sharing()
        const withMe = await api.sharedWithMe()
        const byMe = await api.sharedByMe(accountId)
        if (current) setLists({ withMe, byMe })
      } catch (cause) {
        if (current) setError(toAppError(cause))
      }
    })()
    return () => {
      current = false
    }
  }, [accountId])

  if (!accountId) return null

  const card = (id: string, name: string, detail: string, badge: string) => (
    <li key={id}>
      <Link
        href={paths.shared(id)}
        className="grid gap-1.5 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
          <Badge variant="outline">{badge}</Badge>
        </span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </Link>
    </li>
  )

  return (
    <>
      <section aria-labelledby="home-shared" className="grid gap-3">
        <h2 id="home-shared" className="flex items-center gap-1.5 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          Shared with me
        </h2>
        <FormError error={error} />
        {lists === null ? (
          !error && <Skeleton className="h-20" />
        ) : lists.withMe.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dashboards people share with you appear here. They open without the data or a key.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.withMe.map((entry) =>
              card(
                entry.id,
                entry.name,
                `${entry.ownerName ? `From ${entry.ownerName} · ` : ''}updated ${formatAgo(Date.parse(entry.updatedAt), locale)}`,
                entry.role === 'editor' ? 'Can edit' : 'View only',
              ),
            )}
          </ul>
        )}
      </section>
      {lists && lists.byMe.length > 0 && (
        <section aria-labelledby="home-shared-by-me" className="grid gap-3">
          <h2 id="home-shared-by-me" className="text-sm font-medium">
            Shared by you
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.byMe.map((entry) =>
              card(
                entry.id,
                entry.name,
                `Updated ${formatAgo(Date.parse(entry.updatedAt), locale)}`,
                'Yours',
              ),
            )}
          </ul>
        </section>
      )}
    </>
  )
}

import { Copy, Link2, Link2Off, LoaderCircle } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { appUrl, paths } from '@/app/paths'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { linkIsLive, type ShareLink } from '@/dashboard/cloud'
import { FormError } from '@/features/account/FormError'
import { toAppError, type AppErrorData } from '@/lib/errors'
import { formatMoment } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'
import { sharing } from '@/stores/sharing'
import { useToastStore } from '@/stores/toast'

const EXPIRY = { never: null, '7': 7, '30': 30 } as const
type Expiry = keyof typeof EXPIRY
const DAY_MS = 86_400_000

/** The address a link opens: this deployment's /app/s/<slug>. */
const linkUrl = (slug: string) => `${window.location.origin}${appUrl(paths.sharedLink(slug))}`

/** View-only links (F-SHARE-04): create one (expiring or not), copy it, revoke it. */
export function LinksSection({ cloudId }: { cloudId: string }) {
  const locale = useSettingsStore((state) => state.locale)
  const toast = useToastStore((state) => state.show)
  const [links, setLinks] = useState<ShareLink[] | null>(null)
  const [error, setError] = useState<AppErrorData | null>(null)
  const [expiry, setExpiry] = useState<Expiry>('never')
  const [pending, setPending] = useState(false)
  /** Bumped after each change: the links are read again. */
  const [changes, setChanges] = useState(0)
  const expiryId = useId()

  useEffect(() => {
    let current = true
    void (async () => {
      try {
        const list = await (await sharing()).listLinks(cloudId)
        if (current) setLinks(list)
      } catch (cause) {
        if (current) setError(toAppError(cause))
      }
    })()
    return () => {
      current = false
    }
  }, [cloudId, changes])

  const act = async (work: () => Promise<void>) => {
    setPending(true)
    setError(null)
    try {
      await work()
      setChanges((n) => n + 1)
    } catch (cause) {
      setError(toAppError(cause))
    } finally {
      setPending(false)
    }
  }

  const copy = (slug: string) =>
    navigator.clipboard.writeText(linkUrl(slug)).then(
      () => toast('Link copied.'),
      () => toast('Couldn’t copy: select the link and copy it.'),
    )

  const live = links?.filter((link) => linkIsLive(link)) ?? null

  return (
    <section aria-labelledby="share-link" className="grid gap-3">
      <h3 id="share-link" className="text-sm font-medium">
        View-only link
      </h3>
      <p className="text-xs text-muted-foreground">
        Anyone with the link can see these results, without an account or a key. Revoke it to stop
        that at once.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor={expiryId} className="text-xs text-muted-foreground">
            Expires
          </Label>
          <Select
            value={expiry}
            onValueChange={(value) => setExpiry(value === '7' || value === '30' ? value : 'never')}
          >
            <SelectTrigger id={expiryId} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">Never</SelectItem>
              <SelectItem value="7">In 7 days</SelectItem>
              <SelectItem value="30">In 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            void act(async () => {
              const days = EXPIRY[expiry]
              const link = await (
                await sharing()
              ).createLink(cloudId, days === null ? null : new Date(Date.now() + days * DAY_MS))
              await copy(link.slug)
            })
          }
        >
          {pending ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Link2 aria-hidden />
          )}
          Create and copy link
        </Button>
      </div>
      <FormError error={error} />
      {live === null ? (
        !error && <Skeleton className="h-10" />
      ) : live.length === 0 ? (
        <p className="text-sm text-muted-foreground">No live links.</p>
      ) : (
        <ul aria-label="Live links" className="grid gap-2">
          {live.map((link) => (
            <li key={link.slug} className="grid gap-1">
              <div className="flex items-center gap-1.5">
                <Input
                  readOnly
                  aria-label="Link"
                  value={linkUrl(link.slug)}
                  className="h-8 font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <IconButton label="Copy link" onClick={() => void copy(link.slug)}>
                  <Copy />
                </IconButton>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    void act(async () => {
                      await (await sharing()).revokeLink(link.slug)
                      toast('Link revoked. It no longer opens the dashboard.')
                    })
                  }
                >
                  <Link2Off aria-hidden />
                  Revoke
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {link.expiresAt
                  ? `Expires ${formatMoment(Date.parse(link.expiresAt), locale)}`
                  : 'Doesn’t expire'}{' '}
                · created {formatMoment(Date.parse(link.createdAt), locale)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

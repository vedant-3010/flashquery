import { LoaderCircle, UserPlus, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { IconButton } from '@/components/IconButton'
import { Badge } from '@/components/ui/badge'
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
import { normalizeEmail, type Person } from '@/dashboard/cloud'
import { FormError } from '@/features/account/FormError'
import { AppError, toAppError, type AppErrorData } from '@/lib/errors'
import type { InviteRole } from '@/platform/sharing'
import { useAuthStore } from '@/stores/auth'
import { sharing } from '@/stores/sharing'
import { useToastStore } from '@/stores/toast'

const ROLE_LABEL: Record<InviteRole, string> = { viewer: 'Can view', editor: 'Can edit' }

/** Who it's shared with (F-SHARE-03): invite by email as viewer or editor, see members, remove. */
export function PeopleSection({ cloudId }: { cloudId: string }) {
  const me = useAuthStore((state) => state.account?.email ?? '')
  const toast = useToastStore((state) => state.show)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [error, setError] = useState<AppErrorData | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('viewer')
  const [pending, setPending] = useState(false)
  /** Bumped after each change: the list is read again. */
  const [changes, setChanges] = useState(0)
  const emailId = useId()
  const roleId = useId()

  useEffect(() => {
    let current = true
    void (async () => {
      try {
        const list = await (await sharing()).people(cloudId)
        if (current) setPeople(list)
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

  const invite = () =>
    act(async () => {
      const address = normalizeEmail(email)
      if (!address) {
        throw new AppError({
          code: 'invalid_email',
          message: 'Enter an email address.',
          detail: null,
        })
      }
      if (address === me.toLowerCase()) {
        throw new AppError({
          code: 'invite_self',
          message: 'That’s you: it’s yours already.',
          detail: null,
        })
      }
      await (await sharing()).invite(cloudId, address, role)
      setEmail('')
      toast(`Invited ${address}. They’ll see it when they sign in with that address.`)
    })

  return (
    <section aria-labelledby="share-people" className="grid gap-3">
      <h3 id="share-people" className="text-sm font-medium">
        People
      </h3>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void invite()
        }}
      >
        <div className="grid min-w-48 flex-1 gap-1">
          <Label htmlFor={emailId} className="text-xs text-muted-foreground">
            Email
          </Label>
          <Input
            id={emailId}
            type="email"
            placeholder="name@company.com"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={roleId} className="text-xs text-muted-foreground">
            Access
          </Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value === 'editor' ? 'editor' : 'viewer')}
          >
            <SelectTrigger id={roleId} className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
              <SelectItem value="editor">{ROLE_LABEL.editor}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={pending || !email.trim()}>
          {pending ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <UserPlus aria-hidden />
          )}
          Invite
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Editors can arrange tiles and change titles and text; nobody else can invite. An invite
        works once that address signs in to flashQuery.
      </p>
      <FormError error={error} />
      {people === null ? (
        !error && <Skeleton className="h-10" />
      ) : people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>
      ) : (
        <ul aria-label="People with access" className="grid divide-y rounded-lg border">
          {people.map((person) => (
            <li
              key={`${person.kind}:${person.email}`}
              className="flex items-center gap-2 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{person.name || person.email}</p>
                {person.name && (
                  <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                )}
              </div>
              {person.kind === 'invite' && <Badge variant="outline">Invited</Badge>}
              <span className="text-xs text-muted-foreground">{ROLE_LABEL[person.role]}</span>
              <IconButton
                label={`Remove ${person.email}`}
                size="icon-xs"
                disabled={pending}
                onClick={() =>
                  void act(async () => {
                    const api = await sharing()
                    if (person.kind === 'invite') await api.removeInvite(cloudId, person.email)
                    else if (person.userId) await api.removeMember(cloudId, person.userId)
                    toast(`Removed ${person.email}.`)
                  })
                }
              >
                <X />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

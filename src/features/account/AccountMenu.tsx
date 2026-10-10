import { LogOut, UserRound } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { toAppError } from '@/lib/errors'
import { initials, useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

/**
 * The account in the top bars (F-ACCT-03): "Sign in" for guests, the initials and a menu once signed
 * in, nothing where accounts are off.
 */
export function AccountMenu() {
  const status = useAuthStore((state) => state.status)
  const account = useAuthStore((state) => state.account)
  const [, navigate] = useLocation()
  const toast = useToastStore((state) => state.show)

  if (status === 'off') return null
  if (status === 'checking') return <Skeleton className="size-7 rounded-full" />
  if (status === 'guest' || !account) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={paths.login}>Sign in</Link>
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account: ${account.name || account.email}`}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {initials(account.name || account.email)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        <DropdownMenuLabel className="grid font-normal">
          <span className="truncate font-medium text-foreground">{account.name}</span>
          <span className="truncate text-xs text-muted-foreground">{account.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(paths.account)}>
          <UserRound aria-hidden />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void useAuthStore
              .getState()
              .signOut()
              .then(
                () => toast('Signed out.'),
                (error: unknown) => toast(`Couldn't sign out: ${toAppError(error).message}`),
              )
          }
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

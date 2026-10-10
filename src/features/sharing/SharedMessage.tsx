import { House } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { SharedFrame } from '@/features/sharing/SharedFrame'
import { useAuthStore } from '@/stores/auth'

/** A shared dashboard that can't be shown: revoked, expired, deleted, or no access (F-SHARE-04). */
export function SharedMessage({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  const signedIn = useAuthStore((state) => state.status === 'signed-in')
  return (
    <SharedFrame>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        <div className="flex gap-2">
          {children}
          {signedIn && (
            <Button asChild variant="outline" size="sm">
              <Link href={paths.home}>
                <House aria-hidden />
                Go to Home
              </Link>
            </Button>
          )}
        </div>
      </div>
    </SharedFrame>
  )
}

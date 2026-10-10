import { House } from 'lucide-react'
import { Link } from 'wouter'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { paths } from '@/app/paths'

/** A page with one message and a way Home: not found. */
export function MessagePage({ title, description }: { title: string; description: string }) {
  const theme = useResolvedTheme()
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <Link href={paths.home} className="flex items-center gap-1.5 font-semibold">
          <BrandMark className="size-[18px] text-primary" onDark={theme === 'dark'} />
          flashQuery
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        <Button asChild variant="outline" size="sm">
          <Link href={paths.home}>
            <House aria-hidden />
            Go to Home
          </Link>
        </Button>
      </main>
    </div>
  )
}

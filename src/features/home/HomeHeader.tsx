import { CircleHelp, Settings } from 'lucide-react'
import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { PrivacyBadge } from '@/app/PrivacyBadge'
import { ThemeMenu } from '@/app/ThemeMenu'
import { BrandMark } from '@/components/BrandMark'
import { IconButton } from '@/components/IconButton'
import { AccountMenu } from '@/features/account/AccountMenu'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { useUiStore } from '@/stores/ui'

/** Home's top bar: the brand, privacy mode, theme, how it works and Settings. */
export function HomeHeader() {
  const theme = useResolvedTheme()
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen)
  const setHowItWorksOpen = useUiStore((state) => state.setHowItWorksOpen)
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <Link href={paths.home} className="flex items-center gap-1.5 font-semibold">
        <BrandMark className="size-[18px] text-primary" onDark={theme === 'dark'} />
        flashQuery
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <PrivacyBadge />
        <ThemeMenu />
        <IconButton label="How flashQuery works" onClick={() => setHowItWorksOpen(true)}>
          <CircleHelp />
        </IconButton>
        <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings />
        </IconButton>
        <AccountMenu />
      </div>
    </header>
  )
}

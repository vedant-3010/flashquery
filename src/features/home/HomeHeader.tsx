import { Settings } from 'lucide-react'
import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { AppMenu } from '@/app/AppMenu'
import { DemoChip } from '@/app/DemoChip'
import { HelpMenu } from '@/app/HelpMenu'
import { StatusPill } from '@/app/StatusPill'
import { BrandMark } from '@/components/BrandMark'
import { IconButton } from '@/components/IconButton'
import { AccountMenu } from '@/features/account/AccountMenu'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { useUiStore } from '@/stores/ui'

/** Home's top bar: the brand, demo mode, the privacy pill, Help (how it works, theme) and Settings. */
export function HomeHeader() {
  const theme = useResolvedTheme()
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen)
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <Link href={paths.home} className="flex items-center gap-1.5 font-semibold">
        <BrandMark className="size-[18px] text-primary" onDark={theme === 'dark'} />
        flashQuery
      </Link>
      <div className="ml-auto flex items-center gap-2">
        {/* Phones: the extras are in More (AppMenu), so the account stays on screen. */}
        <div className="flex items-center gap-2 max-md:hidden">
          <DemoChip />
          <StatusPill engine={false} />
          <HelpMenu shortcuts={false} />
          <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings />
          </IconButton>
        </div>
        <div className="md:hidden">
          <AppMenu inProject={false} />
        </div>
        <AccountMenu />
      </div>
    </header>
  )
}

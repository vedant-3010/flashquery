import {
  LayoutDashboard,
  MessageSquareText,
  PanelLeft,
  PanelRight,
  Settings,
  SquareTerminal,
} from 'lucide-react'
import { Link } from 'wouter'
import { AppMenu } from '@/app/AppMenu'
import { DemoChip } from '@/app/DemoChip'
import { HelpMenu } from '@/app/HelpMenu'
import { paths } from '@/app/paths'
import { ProjectMenu } from '@/app/ProjectMenu'
import { StatusPill } from '@/app/StatusPill'
import { BrandMark } from '@/components/BrandMark'
import { IconButton } from '@/components/IconButton'
import { AccountMenu } from '@/features/account/AccountMenu'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUiStore } from '@/stores/ui'

interface TopBarProps {
  showSidebarToggle: boolean
}

export function TopBar({ showSidebarToggle }: TopBarProps) {
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen)
  const sidePanelOpen = useUiStore((state) => state.sidePanelOpen)
  const setSidePanelOpen = useUiStore((state) => state.setSidePanelOpen)
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen)
  const theme = useResolvedTheme()

  return (
    // Phones keep the essentials (datasets, Home, the project, the views, the account) and put
    // the rest in More (AppMenu), so nothing is pushed off-screen (D117).
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:gap-3 sm:px-3">
      {showSidebarToggle && (
        <IconButton label="Show datasets" onClick={() => setSidebarOpen(true)}>
          <PanelLeft />
        </IconButton>
      )}
      {/* Narrow windows keep the icons; the names stay for screen readers. */}
      <Link
        href={paths.home}
        aria-label="flashQuery Home"
        className="relative flex shrink-0 items-center gap-1.5 font-semibold"
      >
        <BrandMark className="size-[18px] text-primary" onDark={theme === 'dark'} />
        <span className="max-xl:sr-only">flashQuery</span>
      </Link>
      <span aria-hidden className="-mx-1.5 text-muted-foreground/60 max-sm:hidden">
        /
      </span>
      <ProjectMenu />
      <TabsList aria-label="Views" className="shrink-0">
        <TabsTrigger value="workspace" className="px-2 sm:px-2.5">
          <MessageSquareText aria-hidden />
          <span className="max-lg:sr-only">Workspace</span>
        </TabsTrigger>
        <TabsTrigger value="sql" className="px-2 sm:px-2.5">
          <SquareTerminal aria-hidden />
          <span className="max-lg:sr-only">SQL</span>
        </TabsTrigger>
        <TabsTrigger value="dashboard" className="px-2 sm:px-2.5">
          <LayoutDashboard aria-hidden />
          <span className="max-lg:sr-only">Dashboard</span>
        </TabsTrigger>
      </TabsList>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Quiet, as in Linear (D118): one status pill; the theme and shortcuts are under Help. */}
        <div className="flex items-center gap-2 max-md:hidden">
          <DemoChip />
          <StatusPill />
        </div>
        <IconButton
          label="Side panel"
          aria-pressed={sidePanelOpen}
          className="max-md:hidden"
          onClick={() => setSidePanelOpen(!sidePanelOpen)}
        >
          <PanelRight />
        </IconButton>
        <div className="max-md:hidden">
          <HelpMenu />
        </div>
        <IconButton
          label="Settings"
          className="max-md:hidden"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings />
        </IconButton>
        <div className="md:hidden">
          <AppMenu inProject />
        </div>
        <AccountMenu />
      </div>
    </header>
  )
}

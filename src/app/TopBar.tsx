import {
  CircleHelp,
  Keyboard,
  LayoutDashboard,
  MessageSquareText,
  PanelLeft,
  PanelRight,
  Settings,
  SquareTerminal,
} from 'lucide-react'
import { Link } from 'wouter'
import { EngineStatusBadge } from '@/app/EngineStatusBadge'
import { paths } from '@/app/paths'
import { PrivacyBadge } from '@/app/PrivacyBadge'
import { ProjectMenu } from '@/app/ProjectMenu'
import { ThemeMenu } from '@/app/ThemeMenu'
import { BrandMark } from '@/components/BrandMark'
import { IconButton } from '@/components/IconButton'
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
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen)
  const setHowItWorksOpen = useUiStore((state) => state.setHowItWorksOpen)
  const theme = useResolvedTheme()

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
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
      <span aria-hidden className="-mx-1.5 text-muted-foreground/60">
        /
      </span>
      <ProjectMenu />
      <TabsList aria-label="Views" className="shrink-0">
        <TabsTrigger value="workspace" className="px-2.5">
          <MessageSquareText aria-hidden />
          <span className="max-lg:sr-only">Workspace</span>
        </TabsTrigger>
        <TabsTrigger value="sql" className="px-2.5">
          <SquareTerminal aria-hidden />
          <span className="max-lg:sr-only">SQL</span>
        </TabsTrigger>
        <TabsTrigger value="dashboard" className="px-2.5">
          <LayoutDashboard aria-hidden />
          <span className="max-lg:sr-only">Dashboard</span>
        </TabsTrigger>
      </TabsList>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <PrivacyBadge />
        <EngineStatusBadge />
        <ThemeMenu />
        <IconButton label="How flashQuery works" onClick={() => setHowItWorksOpen(true)}>
          <CircleHelp />
        </IconButton>
        {/* Narrow (touch) layouts drop it: ? and the command palette still open the list. */}
        <IconButton
          label="Keyboard shortcuts (?)"
          className="max-lg:hidden"
          onClick={() => setShortcutsOpen(true)}
        >
          <Keyboard />
        </IconButton>
        <IconButton
          label="Side panel"
          aria-pressed={sidePanelOpen}
          onClick={() => setSidePanelOpen(!sidePanelOpen)}
        >
          <PanelRight />
        </IconButton>
        <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings />
        </IconButton>
      </div>
    </header>
  )
}

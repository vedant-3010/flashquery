import {
  LayoutDashboard,
  MessageSquareText,
  PanelLeft,
  PanelRight,
  Settings,
  Sparkles,
  SquareTerminal,
} from 'lucide-react'
import { EngineStatusBadge } from '@/app/EngineStatusBadge'
import { PrivacyBadge } from '@/app/PrivacyBadge'
import { ThemeMenu } from '@/app/ThemeMenu'
import { IconButton } from '@/components/IconButton'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUiStore } from '@/stores/ui'

interface TopBarProps {
  showSidebarToggle: boolean
}

export function TopBar({ showSidebarToggle }: TopBarProps) {
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen)
  const sidePanelOpen = useUiStore((state) => state.sidePanelOpen)
  const setSidePanelOpen = useUiStore((state) => state.setSidePanelOpen)

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
      {showSidebarToggle && (
        <IconButton label="Show datasets" onClick={() => setSidebarOpen(true)}>
          <PanelLeft />
        </IconButton>
      )}
      <div className="flex items-center gap-1.5 font-semibold">
        <Sparkles className="size-4 text-primary" aria-hidden />
        AskData
      </div>
      <TabsList aria-label="Views">
        <TabsTrigger value="workspace" className="px-2.5">
          <MessageSquareText aria-hidden />
          Workspace
        </TabsTrigger>
        <TabsTrigger value="sql" className="px-2.5">
          <SquareTerminal aria-hidden />
          SQL
        </TabsTrigger>
        <TabsTrigger value="dashboard" className="px-2.5">
          <LayoutDashboard aria-hidden />
          Dashboard
        </TabsTrigger>
      </TabsList>
      <div className="ml-auto flex items-center gap-2">
        <PrivacyBadge />
        <EngineStatusBadge />
        <ThemeMenu />
        <IconButton
          label="Side panel"
          aria-pressed={sidePanelOpen}
          onClick={() => setSidePanelOpen(!sidePanelOpen)}
        >
          <PanelRight />
        </IconButton>
        {/* Opens provider, key and privacy settings once F-AI-01/02 land (M3). */}
        <IconButton label="Settings" disabled>
          <Settings />
        </IconButton>
      </div>
    </header>
  )
}

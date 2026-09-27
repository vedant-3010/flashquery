import { useEffect } from 'react'
import { AppShell } from '@/app/AppShell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { applyTheme } from '@/lib/theme'

export function App() {
  const theme = useResolvedTheme()
  useEffect(() => applyTheme(theme), [theme])

  return (
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>
  )
}

import { LayoutDashboard } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

export function DashboardView() {
  return (
    <EmptyState
      icon={LayoutDashboard}
      title="No tiles yet"
      description="Pin answers from the workspace to build a dashboard."
    />
  )
}

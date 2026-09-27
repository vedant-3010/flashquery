import { Database } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

export function Sidebar() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="flex h-10 shrink-0 items-center px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Datasets
      </h2>
      <EmptyState
        icon={Database}
        title="No datasets yet"
        description="Tables you load appear here with their columns."
      />
    </div>
  )
}

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useEngineStore, type EngineStatus } from '@/stores/engine'

const STATUS: Record<EngineStatus, { label: string; dot: string }> = {
  idle: { label: 'Engine idle', dot: 'bg-muted-foreground' },
  loading: {
    label: 'Engine loading',
    dot: 'bg-amber-500 animate-pulse motion-reduce:animate-none',
  },
  ready: { label: 'Engine ready', dot: 'bg-emerald-500' },
  error: { label: 'Engine error', dot: 'bg-destructive' },
}

export function EngineStatusBadge() {
  const status = useEngineStore((state) => state.status)
  const version = useEngineStore((state) => state.version)
  const { label, dot } = STATUS[status]

  return (
    <Badge variant="outline" role="status">
      <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
      {label}
      {version && <span className="text-muted-foreground">{version}</span>}
    </Badge>
  )
}

import { Braces, Calendar, Hash, ToggleLeft, Type, type LucideIcon } from 'lucide-react'
import { toLogicalType } from '@/engine/normalize'
import type { LogicalType } from '@/engine/types'
import { cn } from '@/lib/utils'

const ICONS: Record<LogicalType, LucideIcon> = {
  integer: Hash,
  number: Hash,
  text: Type,
  date: Calendar,
  timestamp: Calendar,
  boolean: ToggleLeft,
  other: Braces,
}

export function ColumnTypeIcon({ duckType, className }: { duckType: string; className?: string }) {
  const Icon = ICONS[toLogicalType(duckType)]
  return <Icon className={cn('size-3.5 shrink-0 text-muted-foreground', className)} aria-hidden />
}

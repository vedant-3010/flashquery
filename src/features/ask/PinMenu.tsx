import { Pin } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/IconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toAppError } from '@/lib/errors'
import type { Answer } from '@/stores/ask'
import { pinAnswer } from '@/stores/dashboardJobs'
import { useToastStore } from '@/stores/toast'

/** "Pin to dashboard" (F-DASH-01): as the chart (or KPI) shown, or as a table. */
export function PinMenu({ answer }: { answer: Answer }) {
  const [busy, setBusy] = useState(false)
  const toast = useToastStore((state) => state.show)
  const chartType = answer.chart?.spec.type

  const pin = (asTable: boolean) => {
    setBusy(true)
    pinAnswer(answer, asTable)
      .catch((error: unknown) => toast(`Couldn't pin: ${toAppError(error).message}`))
      .finally(() => setBusy(false))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Pin to dashboard" size="icon-xs" disabled={busy}>
          <Pin />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Pin to dashboard</DropdownMenuLabel>
        {chartType && chartType !== 'table' && (
          <DropdownMenuItem onSelect={() => pin(false)}>
            {chartType === 'kpi' ? 'Pin as KPI' : 'Pin chart'}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => pin(true)}>Pin as table</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

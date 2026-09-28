import { Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAskStore } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'

/** Which tables questions are about (F-ASK-01); default: all loaded tables. */
export function ScopeMenu() {
  const datasets = useDatasetsStore((state) => state.datasets)
  const scope = useAskStore((state) => state.scope)
  const setScope = useAskStore((state) => state.setScope)
  const tables = datasets.map((dataset) => dataset.table)
  const selected = scope === null ? tables : tables.filter((table) => scope.includes(table))
  const label =
    selected.length === tables.length
      ? 'All tables'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} tables`

  const toggle = (table: string, on: boolean) => {
    const next = on ? [...selected, table] : selected.filter((t) => t !== table)
    setScope(next.length === tables.length ? null : next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" aria-label={`Ask about: ${label}`}>
          <Database aria-hidden />
          <span className="max-w-32 truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Ask about</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={selected.length === tables.length}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() => setScope(null)}
        >
          All tables
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {datasets.map((dataset) => (
          <DropdownMenuCheckboxItem
            key={dataset.id}
            checked={selected.includes(dataset.table)}
            disabled={selected.length === 1 && selected[0] === dataset.table}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => toggle(dataset.table, checked === true)}
          >
            <span className="font-mono text-xs">{dataset.table}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react'
import { useId } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { moveColumn, visibleColumns, type ColumnLayout } from '@/features/grid/columnLayout'

/** Show, hide and reorder the grid's columns (F-GRID-05). */
export function ColumnsMenu({
  layout,
  original,
  onChange,
}: {
  layout: ColumnLayout
  /** Column names in the result's own order (for Reset). */
  original: string[]
  onChange: (layout: ColumnLayout) => void
}) {
  const shown = visibleColumns(layout).length
  const prefix = useId()
  const changed = layout.hidden.length > 0 || layout.order.some((name, i) => name !== original[i])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost">
          <Columns3 aria-hidden />
          Columns{layout.hidden.length > 0 ? ` (${shown}/${layout.order.length})` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <ul aria-label="Columns" className="grid max-h-72 gap-0.5 overflow-y-auto text-xs">
          {layout.order.map((name, index) => {
            const visible = !layout.hidden.includes(name)
            const id = `${prefix}-${index}`
            return (
              <li
                key={name}
                className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted"
              >
                <Checkbox
                  id={id}
                  checked={visible}
                  // Keep at least one column.
                  disabled={visible && shown === 1}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...layout,
                      hidden:
                        checked === true
                          ? layout.hidden.filter((h) => h !== name)
                          : [...layout.hidden, name],
                    })
                  }
                />
                <Label htmlFor={id} className="min-w-0 flex-1 truncate font-mono font-normal">
                  {name}
                </Label>
                <IconButton
                  label={`Move ${name} left`}
                  size="icon-xs"
                  disabled={index === 0}
                  onClick={() =>
                    onChange({ ...layout, order: moveColumn(layout.order, index, -1) })
                  }
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label={`Move ${name} right`}
                  size="icon-xs"
                  disabled={index === layout.order.length - 1}
                  onClick={() => onChange({ ...layout, order: moveColumn(layout.order, index, 1) })}
                >
                  <ArrowDown />
                </IconButton>
              </li>
            )
          })}
        </ul>
        {changed && (
          <Button
            size="xs"
            variant="ghost"
            className="mt-1 w-full"
            onClick={() => onChange({ order: original, hidden: [] })}
          >
            Show all in the original order
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

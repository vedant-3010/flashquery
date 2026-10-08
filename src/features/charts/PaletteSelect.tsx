import { ChartPaletteSchema, type ChartPalette } from '@/charts/spec'
import { chartTheme, PALETTES } from '@/charts/theme'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'

const AUTO = '__auto__'

function Swatches({ palette }: { palette: ChartPalette }) {
  const colors = chartTheme(useResolvedTheme(), palette).palette.slice(0, 5)
  return (
    <span className="flex shrink-0 -space-x-0.5" aria-hidden>
      {colors.map((color) => (
        <span
          key={color}
          className="size-2.5 rounded-full ring-1 ring-background"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  )
}

/**
 * Chart colors (F-VIZ-12), with a preview of each palette. `auto` names the inherited choice
 * ("Dashboard default"); without it a palette must be picked.
 */
export function PaletteSelect({
  id,
  value,
  onChange,
  auto,
  size = 'default',
}: {
  id?: string
  value: ChartPalette | null
  onChange: (palette: ChartPalette | null) => void
  auto?: { label: string; palette: ChartPalette }
  size?: 'sm' | 'default'
}) {
  return (
    <Select
      value={value ?? AUTO}
      onValueChange={(next) => onChange(next === AUTO ? null : ChartPaletteSchema.parse(next))}
    >
      <SelectTrigger id={id} size={size} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {auto && (
          <SelectItem value={AUTO}>
            <Swatches palette={auto.palette} />
            {auto.label}
          </SelectItem>
        )}
        {ChartPaletteSchema.options.map((palette) => (
          <SelectItem key={palette} value={palette} title={PALETTES[palette].description}>
            <Swatches palette={palette} />
            {PALETTES[palette].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

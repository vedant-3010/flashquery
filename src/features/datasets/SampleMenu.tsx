import { FlaskConical } from 'lucide-react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SAMPLES } from '@/engine/samples'
import { useDatasetsStore } from '@/stores/datasets'

export function SampleMenu({ compact = false }: { compact?: boolean }) {
  const loadSample = useDatasetsStore((state) => state.loadSample)
  const generated = SAMPLES.filter((sample) => sample.kind === 'generated')
  const files = SAMPLES.filter((sample) => sample.kind === 'csv')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <IconButton label="Try sample data">
            <FlaskConical />
          </IconButton>
        ) : (
          <Button size="sm">
            <FlaskConical aria-hidden />
            Try sample data
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Generated in your browser</DropdownMenuLabel>
        {generated.map((sample) => (
          <DropdownMenuItem key={sample.id} onSelect={() => loadSample(sample.id)}>
            {sample.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Small CSV files</DropdownMenuLabel>
        {files.map((sample) => (
          <DropdownMenuItem
            key={sample.id}
            onSelect={() => loadSample(sample.id)}
            className="flex-col items-start gap-0.5"
          >
            <span>{sample.label}</span>
            <span className="text-xs text-muted-foreground">{sample.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

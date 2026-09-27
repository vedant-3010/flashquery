import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type IconButtonProps = ComponentProps<typeof Button> & {
  /** Accessible name, also shown as the tooltip. */
  label: string
}

/** Icon-only button with an aria-label and a matching tooltip. Works as an `asChild` trigger. */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'icon-sm',
  ...props
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size={size} aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

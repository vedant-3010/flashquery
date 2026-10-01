import { X } from 'lucide-react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { useToastStore } from '@/stores/toast'

/** Toasts, bottom right; announced politely to screen readers. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)
  return (
    <ol
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 bottom-4 z-50 grid w-80 gap-2"
    >
      {toasts.map((toast) => (
        <li
          key={toast.id}
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.action && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                toast.action?.run()
                dismiss(toast.id)
              }}
            >
              {toast.action.label}
            </Button>
          )}
          <IconButton label="Dismiss" size="icon-xs" onClick={() => dismiss(toast.id)}>
            <X />
          </IconButton>
        </li>
      ))}
    </ol>
  )
}

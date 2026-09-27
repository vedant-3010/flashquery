import { Upload } from 'lucide-react'
import { useRef, type ComponentProps } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { ACCEPTED_EXTENSIONS } from '@/engine/ingest'
import { useDatasetsStore } from '@/stores/datasets'

interface UploadButtonProps {
  /** Icon-only for the panel header; labelled for empty states. */
  compact?: boolean
  variant?: ComponentProps<typeof Button>['variant']
}

export function UploadButton({ compact = false, variant = 'outline' }: UploadButtonProps) {
  const input = useRef<HTMLInputElement>(null)
  const addFiles = useDatasetsStore((state) => state.addFiles)
  const open = () => input.current?.click()

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        data-testid="file-input"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []))
          // Let the same file be picked again.
          event.target.value = ''
        }}
      />
      {compact ? (
        <IconButton label="Upload files" onClick={open}>
          <Upload />
        </IconButton>
      ) : (
        <Button variant={variant} size="sm" onClick={open}>
          <Upload aria-hidden />
          Upload files
        </Button>
      )}
    </>
  )
}

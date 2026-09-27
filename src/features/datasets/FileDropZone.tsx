import { FileUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDatasetsStore } from '@/stores/datasets'

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

/** Drop files anywhere in the window to load them (F-DATA-01). */
export function FileDropZone() {
  const [active, setActive] = useState(false)
  const depth = useRef(0)
  const addFiles = useDatasetsStore((state) => state.addFiles)

  useEffect(() => {
    const onEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth.current += 1
      setActive(true)
    }
    const onOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth.current = 0
      setActive(false)
      addFiles(Array.from(event.dataTransfer?.files ?? []))
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles])

  if (!active) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/60 px-16 py-12 text-center">
        <FileUp className="size-10 text-primary" />
        <p className="text-base font-medium">Drop files to load them</p>
        <p className="text-sm text-muted-foreground">
          CSV, TSV, Excel, Parquet or JSON. Files stay on this device.
        </p>
      </div>
    </div>
  )
}

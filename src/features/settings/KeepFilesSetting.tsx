import { useEffect, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { formatBytes } from '@/lib/format'
import { opfsSupported } from '@/lib/opfs'
import { storageUsed } from '@/stores/persistFiles'
import { useSettingsStore } from '@/stores/settings'

/** Opt-in: keep loaded files in the browser's private storage across reloads (F-DATA-12). */
export function KeepFilesSetting() {
  const on = useSettingsStore((state) => state.persistFiles)
  const setOn = useSettingsStore((state) => state.setPersistFiles)
  const locale = useSettingsStore((state) => state.locale)
  const [used, setUsed] = useState<number | null>(null)
  const supported = opfsSupported()

  useEffect(() => {
    let active = true
    // Saving the files takes a moment after the switch: read the figure a little later.
    const timer = window.setTimeout(() => {
      void storageUsed().then((bytes) => active && setUsed(bytes))
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [on])

  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="keep-files"
        checked={on}
        disabled={!supported}
        onCheckedChange={(checked) => setOn(checked === true)}
      />
      <div className="grid gap-1">
        <Label htmlFor="keep-files">Keep loaded files on this device</Label>
        <p className="text-xs text-muted-foreground">
          {supported
            ? `Saves each file you load in this browser's private storage, so your tables come back after a reload. Nothing is uploaded. Turning this off deletes the saved files.${used !== null ? ` This site uses ${formatBytes(used, locale)} of storage.` : ''}`
            : "This browser can't keep files (it lacks the Origin Private File System)."}
        </p>
      </div>
    </div>
  )
}

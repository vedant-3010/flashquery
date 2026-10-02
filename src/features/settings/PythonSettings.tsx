import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/stores/settings'

/** Python auto-run (F-PY-03): off by default, so generated code waits for the user's Run. */
export function PythonSettings() {
  const autoRun = useSettingsStore((state) => state.autoRunPython)
  const setAutoRun = useSettingsStore((state) => state.setAutoRunPython)
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={autoRun}
        onCheckedChange={(on) => setAutoRun(on === true)}
        className="mt-0.5"
      />
      <div className="grid gap-1">
        <Label htmlFor={id}>Run AI-written Python without asking</Label>
        <p className="text-xs text-muted-foreground">
          Off: forecasts and statistics show their code first, and nothing runs until you click Run.
          Either way the code runs in this browser with network access turned off.
        </p>
      </div>
    </div>
  )
}

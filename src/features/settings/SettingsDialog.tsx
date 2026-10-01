import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { PrivacyModeSchema } from '@/ai/schemas'
import { FormatSettings } from '@/features/settings/FormatSettings'
import { ProviderSettings } from '@/features/settings/ProviderSettings'
import { PythonSettings } from '@/features/settings/PythonSettings'
import { PRIVACY_MODES } from '@/features/settings/privacyText'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

/** AI provider, key and privacy mode (F-AI-01, F-AI-02). */
export function SettingsDialog() {
  const open = useUiStore((state) => state.settingsOpen)
  const setOpen = useUiStore((state) => state.setSettingsOpen)
  const privacyMode = useSettingsStore((state) => state.privacyMode)
  const setPrivacyMode = useSettingsStore((state) => state.setPrivacyMode)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Your data stays in this browser. These settings decide which AI writes the SQL and what
            it may see.
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="settings-ai" className="grid gap-3">
          <h3 id="settings-ai" className="text-sm font-medium">
            AI provider
          </h3>
          <ProviderSettings />
        </section>

        <section aria-labelledby="settings-privacy" className="grid gap-3 border-t pt-4">
          <h3 id="settings-privacy" className="text-sm font-medium">
            Privacy mode
          </h3>
          <RadioGroup
            value={privacyMode}
            onValueChange={(value) => setPrivacyMode(PrivacyModeSchema.parse(value))}
            className="grid gap-3"
          >
            {PrivacyModeSchema.options.map((mode) => {
              const info = PRIVACY_MODES[mode]
              return (
                <div key={mode} className="flex items-start gap-2 rounded-lg border p-3">
                  <RadioGroupItem value={mode} id={`privacy-${mode}`} className="mt-0.5" />
                  <div className="grid gap-1 text-xs">
                    <Label htmlFor={`privacy-${mode}`} className="text-sm">
                      {info.label}
                      {mode === 'balanced' && (
                        <span className="font-normal text-muted-foreground">(default)</span>
                      )}
                    </Label>
                    <p className="text-muted-foreground">{info.summary}</p>
                    <p className="font-medium">Sends</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {info.sends.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <p className="font-medium">Never sends</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {info.never.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            Changes apply to your next question. The side panel&apos;s AI inspector shows every
            request exactly as it was sent.
          </p>
        </section>

        <section aria-labelledby="settings-format" className="grid gap-3 border-t pt-4">
          <h3 id="settings-format" className="text-sm font-medium">
            Formatting
          </h3>
          <FormatSettings />
        </section>

        <section aria-labelledby="settings-python" className="grid gap-3 border-t pt-4">
          <h3 id="settings-python" className="text-sm font-medium">
            Python analysis
          </h3>
          <PythonSettings />
        </section>
      </DialogContent>
    </Dialog>
  )
}

import { ChevronDown, Cpu, FlaskConical, KeyRound, Settings2 } from 'lucide-react'
import { localBaseUrl } from '@/ai/localServer'
import { findModel, modelsFor, PROVIDER_LABELS, shortModelLabel } from '@/ai/models'
import { ProviderIdSchema, type ProviderId } from '@/ai/schemas'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const CLOUD: ProviderId[] = ['anthropic', 'openai']

/**
 * The model questions go to (F-ASK-16), in the ask bar. Picking a model from another provider that
 * has a key switches provider too. Keys, custom model IDs and the local server live in Settings.
 */
export function ModelMenu() {
  const settings = useSettingsStore()
  const { provider, models, setProvider, setModel } = settings
  const demo = activeApiKey(settings) === null
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const current = models[provider]
  const name = demo
    ? 'Demo'
    : provider === 'local'
      ? current
      : (findModel(current)?.label ?? current)
  const ready = (id: ProviderId) => activeApiKey({ ...settings, provider: id }) !== null
  const localReady = provider === 'local' && localBaseUrl(settings.baseUrl) !== null

  const pick = (value: string) => {
    const [id, ...rest] = value.split(':')
    const next = ProviderIdSchema.parse(id)
    setProvider(next)
    setModel(next, rest.join(':'))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" aria-label={`Model: ${name}`} title="Choose the model">
          {demo ? <FlaskConical aria-hidden /> : <Cpu aria-hidden />}
          <span className="max-w-32 truncate">
            {demo ? 'Demo' : provider === 'local' ? current : shortModelLabel(current)}
          </span>
          <ChevronDown aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuRadioGroup value={demo ? '' : `${provider}:${current}`} onValueChange={pick}>
          {CLOUD.map((id) => {
            const listed = modelsFor(id)
            const custom =
              id === provider && !listed.some((model) => model.id === current) ? current : null
            return (
              <DropdownMenuGroup key={id}>
                <DropdownMenuLabel>{PROVIDER_LABELS[id]}</DropdownMenuLabel>
                {ready(id) ? (
                  <>
                    {listed.map((model) => (
                      <DropdownMenuRadioItem key={model.id} value={`${id}:${model.id}`}>
                        <span className="grid">
                          <span>{model.label}</span>
                          <span className="text-xs text-muted-foreground">{model.description}</span>
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                    {custom && (
                      <DropdownMenuRadioItem value={`${id}:${custom}`}>
                        <span className="grid">
                          <span className="font-mono text-xs">{custom}</span>
                          <span className="text-xs text-muted-foreground">Custom model ID</span>
                        </span>
                      </DropdownMenuRadioItem>
                    )}
                  </>
                ) : (
                  <DropdownMenuItem onSelect={() => openSettings(true)}>
                    <KeyRound aria-hidden />
                    Add an {PROVIDER_LABELS[id]} key to use its models
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </DropdownMenuGroup>
            )
          })}
          {localReady && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>On this computer</DropdownMenuLabel>
              <DropdownMenuRadioItem value={`local:${models.local}`}>
                <span className="font-mono text-xs">{models.local}</span>
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
          )}
        </DropdownMenuRadioGroup>
        <DropdownMenuItem onSelect={() => openSettings(true)}>
          <Settings2 aria-hidden />
          Keys, custom models and local servers…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

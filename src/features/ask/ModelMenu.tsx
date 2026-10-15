import { ChevronDown, Cpu, FlaskConical, KeyRound, Lock, Settings2 } from 'lucide-react'
import { localBaseUrl } from '@/ai/localServer'
import {
  findModel,
  modelsFor,
  openRouterShortLabel,
  PROVIDER_LABELS,
  shortModelLabel,
} from '@/ai/models'
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
import { allowedOn, plannerModels, remainingLabel, tiersOf } from '@/lib/plans'
import { useAiMode } from '@/stores/aiMode'
import { useAuthStore } from '@/stores/auth'
import { hostedPlanner, usePlanStore } from '@/stores/plan'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const CLOUD: ProviderId[] = ['anthropic', 'openai']

/**
 * The model questions go to (F-ASK-16), in the ask bar: HushGlance AI's models for a signed-in user
 * (F-PLAN-01; premium ones need Pro), then the providers the user has keys for. Picking a model
 * switches who answers too. Keys, custom model IDs and the local server live in Settings.
 */
export function ModelMenu() {
  const settings = useSettingsStore()
  const { provider, models, setProvider, setModel, setAiSource, setHostedModel } = settings
  const mode = useAiMode()
  const demo = mode === 'demo'
  const signedIn = useAuthStore((state) => state.status === 'signed-in')
  const catalogStatus = usePlanStore((state) => state.catalogStatus)
  const catalog = usePlanStore((state) => state.catalog)
  const quota = usePlanStore((state) => state.quota)
  const openUpgrade = usePlanStore((state) => state.openUpgrade)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const hostedOffered = signedIn && catalogStatus !== 'unavailable'
  const planner = mode === 'hosted' && catalog ? hostedPlanner(catalog, quota) : null
  const current = models[provider]

  const name = demo
    ? 'Demo'
    : mode === 'hosted'
      ? (planner?.label ?? 'HushGlance AI')
      : provider === 'local' || provider === 'openrouter'
        ? current
        : (findModel(current)?.label ?? current)
  const short = demo
    ? 'Demo'
    : mode === 'hosted'
      ? (planner?.label.replace(/^Claude /, '') ?? 'HushGlance AI')
      : provider === 'local'
        ? current
        : provider === 'openrouter'
          ? openRouterShortLabel(current)
          : shortModelLabel(current)
  const ready = (id: ProviderId) => activeApiKey({ ...settings, provider: id }) !== null
  const localReady = provider === 'local' && localBaseUrl(settings.baseUrl) !== null
  const selected = demo
    ? ''
    : mode === 'hosted'
      ? `hosted:${planner?.id ?? ''}`
      : `${provider}:${current}`

  const pick = (value: string) => {
    const [id, ...rest] = value.split(':')
    const model = rest.join(':')
    if (id === 'hosted') {
      setAiSource('hosted')
      setHostedModel(model)
      return
    }
    const next = ProviderIdSchema.parse(id)
    setAiSource('own')
    setProvider(next)
    setModel(next, model)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Model: ${name}`}
          title={mode === 'hosted' ? 'HushGlance AI: choose the model' : 'Choose the model'}
        >
          {demo ? <FlaskConical aria-hidden /> : <Cpu aria-hidden />}
          <span className="max-w-32 truncate">{short}</span>
          <ChevronDown aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-(--radix-dropdown-menu-content-available-height) w-80 overflow-y-auto"
      >
        <DropdownMenuRadioGroup value={selected} onValueChange={pick}>
          {hostedOffered && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-baseline justify-between gap-2">
                HushGlance AI
                {quota && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {remainingLabel(quota)}
                  </span>
                )}
              </DropdownMenuLabel>
              {catalog ? (
                plannerModels(catalog).map((model) =>
                  allowedOn(model, quota?.tiers ?? tiersOf(catalog, 'free')) ? (
                    <DropdownMenuRadioItem key={model.id} value={`hosted:${model.id}`}>
                      <span className="grid">
                        <span>{model.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {model.tier === 'premium'
                            ? `Uses ${model.weight} questions. ${model.description}`
                            : model.description}
                        </span>
                      </span>
                    </DropdownMenuRadioItem>
                  ) : (
                    <DropdownMenuItem
                      key={model.id}
                      onSelect={() => openUpgrade('model_not_in_plan')}
                    >
                      <Lock aria-hidden />
                      <span className="grid">
                        <span>
                          {model.label} <span className="text-xs text-brand">Pro</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </span>
                    </DropdownMenuItem>
                  ),
                )
              ) : (
                <DropdownMenuItem disabled>Loading your plan…</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
          )}
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
          {ready('openrouter') && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>OpenRouter</DropdownMenuLabel>
              <DropdownMenuRadioItem value={`openrouter:${models.openrouter}`}>
                <span className="grid">
                  <span className="font-mono text-xs">{models.openrouter}</span>
                  <span className="text-xs text-muted-foreground">
                    Your OpenRouter account, zero data retention
                  </span>
                </span>
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
          )}
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
          Keys, OpenRouter models and local servers…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

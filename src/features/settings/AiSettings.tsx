import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProviderSettings } from '@/features/settings/ProviderSettings'
import { allowedOn, plannerModels, remainingLabel, tiersOf } from '@/lib/plans'
import { useAuthStore } from '@/stores/auth'
import { hostedPlanner, usePlanStore } from '@/stores/plan'
import { AiSourceSchema, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const SOURCES = {
  hosted: {
    label: 'HushGlance AI',
    text: 'Included with your account: 3 free questions, then Starter or Pro. Works on every device you sign in to. Every request demands zero data retention.',
  },
  own: {
    label: 'Your own key',
    text: 'Anthropic, OpenAI, OpenRouter or a model on this computer. Unlimited, billed by your provider; requests go straight from this browser.',
  },
} as const

/** Who answers (F-PLAN-01, F-AI-01): HushGlance AI for a signed-in user, or their own key. */
export function AiSettings() {
  const status = useAuthStore((state) => state.status)
  const catalogStatus = usePlanStore((state) => state.catalogStatus)
  const aiSource = useSettingsStore((state) => state.aiSource)
  const setAiSource = useSettingsStore((state) => state.setAiSource)
  const offered = status === 'signed-in' && catalogStatus !== 'unavailable'

  return (
    <div className="grid gap-4">
      {status === 'guest' && (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          No key?{' '}
          <Link href={paths.login} className="font-medium text-foreground underline">
            Sign in
          </Link>{' '}
          for 3 free questions with HushGlance AI, on any device.
        </p>
      )}
      {offered && (
        <RadioGroup
          aria-label="Who answers"
          value={aiSource}
          onValueChange={(value) => setAiSource(AiSourceSchema.parse(value))}
          className="grid gap-2"
        >
          {AiSourceSchema.options.map((source) => (
            <div key={source} className="flex items-start gap-2 rounded-lg border p-3">
              <RadioGroupItem value={source} id={`ai-source-${source}`} className="mt-0.5" />
              <div className="grid gap-0.5">
                <Label htmlFor={`ai-source-${source}`}>{SOURCES[source].label}</Label>
                <p className="text-xs text-muted-foreground">{SOURCES[source].text}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
      )}
      {offered && aiSource === 'hosted' ? <HostedSettings /> : <ProviderSettings />}
    </div>
  )
}

function HostedSettings() {
  const catalog = usePlanStore((state) => state.catalog)
  const quota = usePlanStore((state) => state.quota)
  const hostedModel = useSettingsStore((state) => state.hostedModel)
  const setHostedModel = useSettingsStore((state) => state.setHostedModel)
  const closeSettings = useUiStore((state) => state.setSettingsOpen)
  if (!catalog) return <p className="text-xs text-muted-foreground">Loading your plan…</p>
  const tiers = quota?.tiers ?? tiersOf(catalog, 'free')
  const planner = hostedPlanner(catalog, quota)

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="ai-hosted-model">Model</Label>
        <Select value={planner?.id ?? hostedModel} onValueChange={setHostedModel}>
          <SelectTrigger id="ai-hosted-model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {plannerModels(catalog).map((model) => (
              <SelectItem key={model.id} value={model.id} disabled={!allowedOn(model, tiers)}>
                {model.label}
                <span className="text-xs text-muted-foreground">
                  {model.tier === 'premium'
                    ? allowedOn(model, tiers)
                      ? `· ${model.weight} questions each`
                      : '· Pro'
                    : `· ${model.maker}`}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {quota ? `${quota.label} plan · ${remainingLabel(quota)}` : 'Checking your plan…'}
        </span>
        <Button asChild size="xs" variant="link" className="h-auto px-0">
          <Link href={paths.billing} onClick={() => closeSettings(false)}>
            Plan and billing
          </Link>
        </Button>
      </div>
    </div>
  )
}

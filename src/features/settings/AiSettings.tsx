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
import {
  allowedOn,
  GUEST_DAILY_QUESTIONS,
  plannerModels,
  remainingLabel,
  tiersOf,
} from '@/lib/plans'
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

/** For a guest (D125): HushGlance AI without an account, and what that means. */
const GUEST_SOURCES = {
  hosted: {
    label: 'HushGlance AI, no account',
    text: `${GUEST_DAILY_QUESTIONS} free questions a day on this connection. To count them, our server keeps a scrambled code made from your internet address (never the address) for 2 days. Every request demands zero data retention.`,
  },
  own: SOURCES.own,
} as const

/**
 * Who answers (F-PLAN-01, F-AI-01): HushGlance AI for a signed-in user, or for a guest who turns
 * it on (D125), or their own key.
 */
export function AiSettings() {
  const status = useAuthStore((state) => state.status)
  const catalogStatus = usePlanStore((state) => state.catalogStatus)
  const aiSource = useSettingsStore((state) => state.aiSource)
  const setAiSource = useSettingsStore((state) => state.setAiSource)
  const guestAi = useSettingsStore((state) => state.guestAi)
  const setGuestAi = useSettingsStore((state) => state.setGuestAi)
  const guest = status === 'guest'
  const missing = catalogStatus === 'unavailable'
  // A guest always sees the choice: picking HushGlance AI is what turns it on.
  const choosing = status === 'signed-in' ? !missing : guest
  const offered = (status === 'signed-in' || (guest && guestAi)) && !missing
  const chosen = guest && !guestAi ? 'own' : aiSource
  const sources = guest ? GUEST_SOURCES : SOURCES

  const choose = (value: string) => {
    const source = AiSourceSchema.parse(value)
    if (!guest) return setAiSource(source)
    // A guest who leaves HushGlance AI turns it off: their browser stops contacting our service.
    if (source === 'hosted') setGuestAi(true)
    else {
      setGuestAi(false)
      setAiSource('own')
    }
  }

  return (
    <div className="grid gap-4">
      {choosing && (
        <RadioGroup
          aria-label="Who answers"
          value={chosen}
          onValueChange={choose}
          className="grid gap-2"
        >
          {AiSourceSchema.options.map((source) => (
            <div key={source} className="flex items-start gap-2 rounded-lg border p-3">
              <RadioGroupItem value={source} id={`ai-source-${source}`} className="mt-0.5" />
              <div className="grid gap-0.5">
                <Label htmlFor={`ai-source-${source}`}>{sources[source].label}</Label>
                <p className="text-xs text-muted-foreground">{sources[source].text}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
      )}
      {guest && guestAi && missing && (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          HushGlance AI without an account isn’t available here right now.{' '}
          <Link href={paths.login} className="font-medium text-foreground underline">
            Sign in
          </Link>{' '}
          for 3 free questions, or add your own key.
        </p>
      )}
      {offered && chosen === 'hosted' ? <HostedSettings /> : <ProviderSettings />}
    </div>
  )
}

function HostedSettings() {
  const catalog = usePlanStore((state) => state.catalog)
  const quota = usePlanStore((state) => state.quota)
  const hostedModel = useSettingsStore((state) => state.hostedModel)
  const setHostedModel = useSettingsStore((state) => state.setHostedModel)
  const closeSettings = useUiStore((state) => state.setSettingsOpen)
  const guest = usePlanStore((state) => state.audience === 'guest')
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
          {quota
            ? guest
              ? `No account · ${remainingLabel(quota)}`
              : `${quota.label} plan · ${remainingLabel(quota)}`
            : 'Checking your plan…'}
        </span>
        <Button asChild size="xs" variant="link" className="h-auto px-0">
          <Link href={guest ? paths.register : paths.billing} onClick={() => closeSettings(false)}>
            {guest ? 'Create a free account' : 'Plan and billing'}
          </Link>
        </Button>
      </div>
    </div>
  )
}

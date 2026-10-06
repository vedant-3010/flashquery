import { CircleCheck, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { LOCAL_PRESETS, localBaseUrl } from '@/ai/localServer'
import { MODELS, modelsFor, PROVIDER_LABELS } from '@/ai/models'
import { TEST_PROMPT } from '@/ai/prompts/testConnection'
import { createProvider } from '@/ai/providers'
import { ProviderIdSchema } from '@/ai/schemas'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toAppError } from '@/lib/errors'
import { useAiLogStore } from '@/stores/aiLog'
import { activeApiKey, useSettingsStore } from '@/stores/settings'

const CUSTOM = '__custom__'

type TestState = { status: 'idle' | 'testing' | 'ok' } | { status: 'error'; message: string }

/** Provider, key, model and "Test connection" (F-AI-01). */
export function ProviderSettings() {
  const { provider, models, apiKeys, rememberKey, baseUrl } = useSettingsStore()
  const { setProvider, setModel, setApiKey, setRememberKey, setBaseUrl } = useSettingsStore()
  const credential = useSettingsStore(activeApiKey)
  const local = provider === 'local'
  const validUrl = local ? localBaseUrl(baseUrl) : null
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const model = models[provider]
  const known = MODELS.some((m) => m.id === model && m.provider === provider)
  const [custom, setCustom] = useState(!known)
  const key = apiKeys[provider] ?? ''

  const testConnection = async () => {
    setTest({ status: 'testing' })
    const started = Date.now()
    let error: string | null = null
    try {
      const client = await createProvider({
        provider,
        apiKey: credential ?? key,
        model,
        baseUrl: validUrl ?? undefined,
      })
      await client.testConnection(AbortSignal.timeout(30_000))
      setTest({ status: 'ok' })
    } catch (caught) {
      error = toAppError(caught).message
      setTest({ status: 'error', message: error })
    }
    // Like every request, the test shows up in the AI inspector (F-EXPL-04).
    useAiLogStore.getState().add(
      {
        id: `log_test_${started.toString(36)}`,
        answerId: '',
        purpose: 'test',
        provider,
        model,
        mode: useSettingsStore.getState().privacyMode,
        dataValues: 0,
        messages: [{ role: 'user', content: TEST_PROMPT }],
        output: error === null ? 'OK' : null,
        error,
        usage: null,
        ms: Date.now() - started,
        at: started,
      },
      [key],
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="ai-provider">Provider</Label>
        <Select
          value={provider}
          onValueChange={(value) => {
            setProvider(ProviderIdSchema.parse(value))
            setTest({ status: 'idle' })
          }}
        >
          <SelectTrigger id="ai-provider" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ProviderIdSchema.options.map((id) => (
              <SelectItem key={id} value={id}>
                {PROVIDER_LABELS[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {local && (
        <div className="grid gap-2">
          <Label htmlFor="ai-base-url">Server URL</Label>
          <Input
            id="ai-base-url"
            className="font-mono"
            spellCheck={false}
            value={baseUrl}
            onChange={(event) => {
              setBaseUrl(event.target.value)
              setTest({ status: 'idle' })
            }}
          />
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {LOCAL_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                size="xs"
                variant="outline"
                onClick={() => {
                  setBaseUrl(preset.url)
                  setTest({ status: 'idle' })
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {validUrl === null ? (
            <p role="alert" className="text-xs text-destructive">
              Use a server on this computer (http://localhost:… or http://127.0.0.1:…).
              flashQuery&apos;s security policy blocks other addresses.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Any OpenAI-compatible server with JSON-schema output. It must accept requests from{' '}
              <span className="font-mono">{window.location.origin}</span> (Ollama:{' '}
              <span className="font-mono">OLLAMA_ORIGINS</span>). Nothing leaves this computer.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="ai-key">
          {PROVIDER_LABELS[provider]} API key{local ? ' (optional)' : ''}
        </Label>
        <div className="flex gap-1.5">
          <Input
            id="ai-key"
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            placeholder={
              provider === 'anthropic' ? 'sk-ant-…' : local ? 'Usually not needed' : 'sk-…'
            }
            value={key}
            onChange={(event) => {
              setApiKey(provider, event.target.value)
              setTest({ status: 'idle' })
            }}
          />
          <IconButton
            label={showKey ? 'Hide key' : 'Show key'}
            size="icon"
            variant="outline"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? <EyeOff /> : <Eye />}
          </IconButton>
        </div>
        <p className="text-xs text-muted-foreground">
          {local
            ? 'Sent only to your local server.'
            : `Sent only to ${PROVIDER_LABELS[provider]}, straight from this browser. Without a key, flashQuery runs in demo mode.`}
        </p>
      </div>

      {local ? (
        <div className="grid gap-2">
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            className="font-mono"
            spellCheck={false}
            placeholder="qwen2.5-coder:7b"
            value={model}
            onChange={(event) => {
              setModel(provider, event.target.value)
              setTest({ status: 'idle' })
            }}
          />
          <p className="text-xs text-muted-foreground">
            The model name as your server knows it. Small models write noticeably weaker SQL.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="ai-model">Model</Label>
          <Select
            value={custom ? CUSTOM : model}
            onValueChange={(value) => {
              setTest({ status: 'idle' })
              if (value === CUSTOM) {
                setCustom(true)
                return
              }
              setCustom(false)
              setModel(provider, value)
            }}
          >
            <SelectTrigger id="ai-model" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelsFor(provider).map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>Custom model ID…</SelectItem>
            </SelectContent>
          </Select>
          {custom && (
            <Input
              aria-label="Custom model ID"
              className="font-mono"
              spellCheck={false}
              value={model}
              onChange={(event) => setModel(provider, event.target.value)}
            />
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={!credential || !model || test.status === 'testing'}
          onClick={() => void testConnection()}
        >
          {test.status === 'testing' && <LoaderCircle className="animate-spin" aria-hidden />}
          Test connection
        </Button>
        <span role="status" className="text-xs">
          {test.status === 'ok' && (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-3.5" aria-hidden /> Connected
            </span>
          )}
          {test.status === 'error' && <span className="text-destructive">{test.message}</span>}
        </span>
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="ai-remember"
          checked={rememberKey}
          onCheckedChange={(checked) => setRememberKey(checked === true)}
        />
        <div className="grid gap-1">
          <Label htmlFor="ai-remember">Remember on this device</Label>
          <p className="text-xs text-muted-foreground">
            Saves the key unencrypted in this browser&apos;s storage, so anyone using this browser
            profile could read it. Leave off on shared computers; the key is then forgotten when you
            close the tab.
          </p>
        </div>
      </div>
    </div>
  )
}

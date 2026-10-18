import { useEffect, useState } from 'react'
import { listOpenRouterModels, type OpenRouterModel } from '@/ai/openRouter'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

let cached: Promise<OpenRouterModel[]> | null = null

/**
 * The model for the user's own OpenRouter account (F-AI-07): any slug, with suggestions from
 * OpenRouter's public lists (structured outputs on a zero-retention endpoint), loaded on first focus.
 */
export function OpenRouterModelInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [models, setModels] = useState<OpenRouterModel[] | null>(null)
  const [wanted, setWanted] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!wanted) return
    let current = true
    cached ??= listOpenRouterModels()
    cached.then(
      (list) => {
        if (current) setModels(list)
      },
      () => {
        cached = null
        if (current) setFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [wanted])

  const listed = models?.find((model) => model.id === value)
  return (
    <div className="grid gap-2">
      <Label htmlFor="ai-openrouter-model">Model</Label>
      <Input
        id="ai-openrouter-model"
        className="font-mono"
        spellCheck={false}
        list="ai-openrouter-models"
        placeholder="anthropic/claude-sonnet-5"
        value={value}
        onFocus={() => setWanted(true)}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id="ai-openrouter-models">
        {models?.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground">
        {listed
          ? `${listed.name}: $${listed.inputPerMTok.toFixed(2)} in, $${listed.outputPerMTok.toFixed(2)} out per million tokens.`
          : models
            ? `${models.length} models answer with zero data retention. Type to search them.`
            : failed
              ? 'Couldn’t load OpenRouter’s model list; any model slug works.'
              : 'Any OpenRouter model slug (maker/model). Its maker’s fast model writes summaries.'}
      </p>
    </div>
  )
}

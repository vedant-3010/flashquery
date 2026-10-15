import { localBaseUrl } from '@/ai/localServer'
import type { AiLogEntry } from '@/ai/log'
import type { Turn } from '@/ai/prompts/planSql'
import { createProvider, type LLMProvider } from '@/ai/providers'
import { fixtureProvider } from '@/ai/providers/fixture'
import type { RequestEffort } from '@/ai/schemas'
import { getDb } from '@/engine/duckdb'
import { closeResult, type PagedResult } from '@/engine/paging'
import { useAiLogStore } from '@/stores/aiLog'
import { useAuthStore } from '@/stores/auth'
import { hostedAvailable, hostedProvider, newMeter, type Meter } from '@/stores/plan'
import { activeApiKey, useSettingsStore } from '@/stores/settings'

// Helpers for the ask store (stores/ask.ts): the provider, follow-up turns, logging, cleanup.

let providerCache: { key: string; provider: Promise<LLMProvider> } | null = null

/** Each answer's hosted question (F-PLAN-02): its repairs, summary and Python fix share it. */
const meters = new Map<string, Meter>()

export function meterFor(answerId: string): Meter {
  let meter = meters.get(answerId)
  if (!meter) {
    meter = newMeter('ask')
    meters.set(answerId, meter)
  }
  return meter
}

/**
 * The provider that answers (aiMode.ts): HushGlance AI for a signed-in user who chose it, else
 * their own key, else demo fixtures (F-AI-03). `chosen`: the effort Auto picked for this question
 * (F-ASK-18), in place of the setting. `meter`: the hosted question these calls belong to (a new
 * one when left out); own keys and the demo ignore it.
 */
export async function currentProvider(chosen?: RequestEffort, meter?: Meter): Promise<LLMProvider> {
  const settings = useSettingsStore.getState()
  if (
    useAuthStore.getState().status === 'signed-in' &&
    settings.aiSource === 'hosted' &&
    (await hostedAvailable())
  ) {
    return hostedProvider(chosen ?? settings.effort, meter ?? newMeter('ask'))
  }
  const apiKey = activeApiKey(settings)
  if (!apiKey) return fixtureProvider
  const model = settings.models[settings.provider]
  const baseUrl =
    settings.provider === 'local' ? (localBaseUrl(settings.baseUrl) ?? undefined) : undefined
  const effort = chosen ?? settings.effort
  const cacheKey = `${settings.provider}:${model}:${effort}:${apiKey}:${baseUrl ?? ''}`
  if (providerCache?.key !== cacheKey) {
    providerCache = {
      key: cacheKey,
      provider: createProvider({ provider: settings.provider, apiKey, model, effort, baseUrl }),
    }
  }
  return providerCache.provider
}

interface TurnSource {
  status: string
  question: string
  sql: string | null
  result: PagedResult | null
}

/** Follow-up context: the last answered turns (question, SQL, column names, row count). */
export function turns(answers: TurnSource[]): Turn[] {
  return answers
    .filter((answer) => answer.status === 'answered' && answer.result)
    .slice(-3)
    .map((answer) => ({
      question: answer.question,
      sql: answer.sql,
      columns: answer.result?.columns.map((column) => column.name) ?? [],
      rowCount: answer.result?.rowCount ?? null,
    }))
}

/** The user's local date (not UTC), so "this month" means what they expect. */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Adds a request to the AI inspector, scrubbed of the user's keys (F-SEC-04). */
export function logRequest(entry: AiLogEntry): void {
  const keys = Object.values(useSettingsStore.getState().apiKeys).filter(
    (key): key is string => key !== null,
  )
  useAiLogStore.getState().add(entry, keys)
}

/** Drops an answer's temp result view once nothing shows it any more. */
export function release(result: PagedResult | null): void {
  if (!result) return
  getDb()
    .then((engine) => closeResult(engine, result))
    .catch((error: unknown) => console.warn('HushGlance: could not drop a result view', error))
}

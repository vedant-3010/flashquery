import { localBaseUrl } from '@/ai/localServer'
import type { AiLogEntry } from '@/ai/log'
import type { Turn } from '@/ai/prompts/planSql'
import { createProvider, type LLMProvider } from '@/ai/providers'
import { fixtureProvider } from '@/ai/providers/fixture'
import { getDb } from '@/engine/duckdb'
import { closeResult, type PagedResult } from '@/engine/paging'
import { useAiLogStore } from '@/stores/aiLog'
import { activeApiKey, useSettingsStore } from '@/stores/settings'

// Helpers for the ask store (stores/ask.ts): the provider, follow-up turns, logging, cleanup.

let providerCache: { key: string; provider: Promise<LLMProvider> } | null = null

/** The configured provider, or demo fixtures when there's no key (F-AI-03). */
export function currentProvider(): Promise<LLMProvider> {
  const settings = useSettingsStore.getState()
  const apiKey = activeApiKey(settings)
  if (!apiKey) return Promise.resolve(fixtureProvider)
  const model = settings.models[settings.provider]
  const baseUrl =
    settings.provider === 'local' ? (localBaseUrl(settings.baseUrl) ?? undefined) : undefined
  const cacheKey = `${settings.provider}:${model}:${apiKey}:${baseUrl ?? ''}`
  if (providerCache?.key !== cacheKey) {
    providerCache = {
      key: cacheKey,
      provider: createProvider({ provider: settings.provider, apiKey, model, baseUrl }),
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
    .catch((error: unknown) => console.warn('flashQuery: could not drop a result view', error))
}

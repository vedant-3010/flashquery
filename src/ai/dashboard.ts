import { buildContext, countDataValues, fetchSamples } from '@/ai/context'
import type { AiLogEntry } from '@/ai/log'
import { buildDashboardMessages } from '@/ai/prompts/planDashboard'
import type { DashboardResponse, LLMProvider } from '@/ai/providers'
import type { DashboardPlan, PrivacyMode } from '@/ai/schemas'
import type { PlanSize } from '@/dashboard/layout'
import { runTile, type TileRunResult } from '@/dashboard/run'
import type { Engine } from '@/engine/connection'
import type { DatasetProfile } from '@/engine/types'
import { AppError, isCancellation, toAppError } from '@/lib/errors'

// F-DASH-09: "Generate dashboard". The AI proposes 4–8 tiles for one table (DashboardPlan, built
// from the same privacy-mode context as questions); every tile then goes through the guard and runs
// like any other tile. Tiles that fail are left out and reported. Demo mode replays a fixture.

const LLM_TIMEOUT_MS = 120_000
const MAX_TILES = 8
let logCounter = 0

export interface GenerateInput {
  provider: LLMProvider
  engine: Engine
  dataset: DatasetProfile
  /** All loaded datasets (the guard's allow-list). */
  datasets: DatasetProfile[]
  mode: PrivacyMode
  focus?: string
  currency: string | null
  today: string
  signal: AbortSignal
  onProgress?: (progress: GenerateProgress) => void
  onLog?: (entry: AiLogEntry) => void
}

export interface TileProgress {
  title: string
  status: 'pending' | 'running' | 'done' | 'error'
  error: string | null
}

export interface GenerateProgress {
  stage: 'planning' | 'tiles' | 'done'
  title: string | null
  tiles: TileProgress[]
}

export interface GeneratedTile extends TileRunResult {
  title: string
  size: PlanSize
}

export interface GeneratedDashboard {
  title: string
  tiles: GeneratedTile[]
  failed: { title: string; error: string }[]
}

async function plan(input: GenerateInput): Promise<DashboardPlan> {
  const { provider, dataset, mode, signal } = input
  const samples =
    mode === 'balanced' && provider.remote
      ? await fetchSamples(input.engine, [dataset.table], signal)
      : undefined
  const context = buildContext({ datasets: [dataset], mode, samples })
  const messages = buildDashboardMessages({
    context,
    table: dataset.table,
    focus: input.focus,
    today: input.today,
  })
  const call = async (): Promise<DashboardResponse> => {
    const started = performance.now()
    const log = (output: unknown, error: string | null, usage: DashboardResponse['usage']) => {
      if (!provider.remote) return
      input.onLog?.({
        id: `log_dash_${Date.now().toString(36)}_${(logCounter += 1)}`,
        answerId: '',
        purpose: 'dashboard',
        provider: provider.id,
        model: provider.model,
        effort: provider.effort ?? null,
        mode,
        dataValues: countDataValues(context),
        messages: messages.map(({ role, content }) => ({ role, content })),
        output,
        error,
        usage,
        ms: performance.now() - started,
        at: Date.now(),
      })
    }
    try {
      const response = await provider.planDashboard({
        messages,
        table: dataset.table,
        signal: AbortSignal.any([signal, AbortSignal.timeout(LLM_TIMEOUT_MS)]),
      })
      log(response.plan, null, response.usage)
      return response
    } catch (error) {
      log(null, toAppError(error).message, null)
      throw error
    }
  }
  try {
    return (await call()).plan
  } catch (error) {
    // One retry when the reply didn't match the schema, like question planning.
    if (error instanceof AppError && error.code === 'ai_bad_output') return (await call()).plan
    throw error
  }
}

export async function generateDashboard(input: GenerateInput): Promise<GeneratedDashboard> {
  const progress: GenerateProgress = { stage: 'planning', title: null, tiles: [] }
  const report = () =>
    input.onProgress?.({ ...progress, tiles: progress.tiles.map((tile) => ({ ...tile })) })
  report()

  const proposal = await plan(input)
  const planned = proposal.tiles.slice(0, MAX_TILES)
  if (planned.length === 0) {
    throw new AppError({
      code: 'dashboard_empty',
      message: 'The AI did not propose any tiles. Try again, or describe what to focus on.',
      detail: null,
    })
  }
  progress.stage = 'tiles'
  progress.title = proposal.title
  progress.tiles = planned.map((tile) => ({ title: tile.title, status: 'pending', error: null }))
  report()

  const tiles: GeneratedTile[] = []
  const failed: GeneratedDashboard['failed'] = []
  for (const [index, tile] of planned.entries()) {
    const entry = progress.tiles[index]
    if (!entry) continue
    entry.status = 'running'
    report()
    try {
      const result = await runTile(input.engine, {
        sql: tile.sql,
        spec: null,
        asTable: false,
        title: tile.title,
        hint: tile.chartHint,
        currency: input.currency,
        datasets: input.datasets,
        filters: [],
        signal: input.signal,
      })
      tiles.push({ ...result, title: tile.title, size: tile.size })
      entry.status = 'done'
    } catch (error) {
      if (isCancellation(error)) throw error
      const message = toAppError(error).message
      failed.push({ title: tile.title, error: message })
      entry.status = 'error'
      entry.error = message
    }
    report()
  }
  progress.stage = 'done'
  report()
  if (tiles.length === 0) {
    throw new AppError({
      code: 'dashboard_failed',
      message: 'None of the proposed tiles could run.',
      detail: failed.map((f) => `${f.title}: ${f.error}`).join('\n'),
    })
  }
  return { title: proposal.title, tiles, failed }
}

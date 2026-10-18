import { describe, expect, it } from 'vitest'
import {
  allowedOn,
  meterVisible,
  pickHostedModel,
  plannerModels,
  remainingLabel,
  summaryModelFor,
  upgradesFrom,
  type Catalog,
} from '@/lib/plans'

// The hosted plan rules the app applies before asking (F-PLAN-01/02); the server enforces the same
// (supabase/tests/plans.test.sql).

const catalog: Catalog = {
  models: [
    {
      id: 'anthropic/claude-sonnet-5',
      label: 'Claude Sonnet 5',
      maker: 'Anthropic',
      description: '',
      tier: 'standard',
      weight: 1,
    },
    {
      id: 'openai/gpt-6-sol',
      label: 'GPT-6 Sol',
      maker: 'OpenAI',
      description: '',
      tier: 'standard',
      weight: 1,
    },
    {
      id: 'anthropic/claude-opus-5.5',
      label: 'Claude Opus 5.5',
      maker: 'Anthropic',
      description: '',
      tier: 'premium',
      weight: 5,
    },
    {
      id: 'anthropic/claude-haiku-4.5',
      label: 'Claude Haiku 4.5',
      maker: 'Anthropic',
      description: '',
      tier: 'fast',
      weight: 1,
    },
    {
      id: 'openai/gpt-6-luna',
      label: 'GPT-6 Luna',
      maker: 'OpenAI',
      description: '',
      tier: 'fast',
      weight: 1,
    },
  ],
  plans: [
    {
      id: 'free',
      label: 'Free',
      questions: 3,
      period: 'lifetime',
      tiers: ['standard'],
      price_monthly_usd: null,
      price_yearly_usd: null,
      storage_bytes: 500000000,
    },
    {
      id: 'starter',
      label: 'Starter',
      questions: 100,
      period: 'month',
      tiers: ['standard'],
      price_monthly_usd: 5,
      price_yearly_usd: 50,
      storage_bytes: 5000000000,
    },
    {
      id: 'pro',
      label: 'Pro',
      questions: 300,
      period: 'month',
      tiers: ['standard', 'premium'],
      price_monthly_usd: 12,
      price_yearly_usd: 120,
      storage_bytes: 25000000000,
    },
  ],
}

describe('plans', () => {
  it('offers planners, not the fast summary models', () => {
    expect(plannerModels(catalog).map((model) => model.id)).toEqual([
      'anthropic/claude-sonnet-5',
      'openai/gpt-6-sol',
      'anthropic/claude-opus-5.5',
    ])
  })

  it('keeps premium models for Pro', () => {
    const opus = catalog.models[2]!
    expect(allowedOn(opus, ['standard'])).toBe(false)
    expect(allowedOn(opus, ['standard', 'premium'])).toBe(true)
    expect(pickHostedModel(catalog, opus.id, ['standard'])?.id).toBe('anthropic/claude-sonnet-5')
    expect(pickHostedModel(catalog, opus.id, ['standard', 'premium'])?.id).toBe(opus.id)
    expect(pickHostedModel(catalog, 'gone/model', ['standard'])?.id).toBe(
      'anthropic/claude-sonnet-5',
    )
    expect(pickHostedModel({ ...catalog, models: [] }, 'x', ['standard'])).toBeNull()
  })

  it('summarizes with the planner’s maker’s fast model', () => {
    expect(summaryModelFor(catalog, catalog.models[1]!)).toBe('openai/gpt-6-luna')
    expect(summaryModelFor(catalog, catalog.models[2]!)).toBe('anthropic/claude-haiku-4.5')
  })

  it('words the meter, and shows it on Pro only when it runs low', () => {
    expect(remainingLabel({ plan: 'free', period: 'lifetime', remaining: 2 })).toBe(
      '2 free questions left',
    )
    expect(remainingLabel({ plan: 'free', period: 'lifetime', remaining: 1 })).toBe(
      '1 free question left',
    )
    expect(remainingLabel({ plan: 'free', period: 'lifetime', remaining: 0 })).toBe(
      'No free questions left',
    )
    expect(remainingLabel({ plan: 'pro', period: 'month', remaining: 40 })).toBe(
      '40 questions left this month',
    )
    expect(meterVisible({ plan: 'free', questions: 3, remaining: 3 })).toBe(true)
    expect(meterVisible({ plan: 'pro', questions: 300, remaining: 200 })).toBe(false)
    expect(meterVisible({ plan: 'pro', questions: 300, remaining: 40 })).toBe(true)
  })

  it('offers the plans above the current one, cheapest first', () => {
    expect(upgradesFrom(catalog, 'free').map((plan) => plan.id)).toEqual(['starter', 'pro'])
    expect(upgradesFrom(catalog, 'starter').map((plan) => plan.id)).toEqual(['pro'])
    expect(upgradesFrom(catalog, 'pro')).toEqual([])
    expect(remainingLabel({ plan: 'starter', period: 'month', remaining: 12 })).toBe(
      '12 questions left this month',
    )
    expect(meterVisible({ plan: 'starter', questions: 100, remaining: 19 })).toBe(true)
  })
})

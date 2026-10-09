import type { RequestEffort } from '@/ai/schemas'

// Auto effort (F-ASK-18, D112): picks how hard the model thinks per question. Hard shapes (windows,
// cohorts, comparisons, percentiles, rankings within groups) and long questions get high; short
// totals and counts get low; the rest medium. The reason shows in the timeline. Pure.

export interface EffortChoice {
  effort: RequestEffort
  /** Why, in a few words ("running window"). */
  reason: string
}

const HARD: [RegExp, string][] = [
  [/\b(cohorts?|retention|churn)\b/i, 'cohorts'],
  [/\b(rolling|moving average|running total|cumulative|ytd|year to date)\b/i, 'running window'],
  [/\b(yoy|mom|year[- ]over[- ]year|month[- ]over[- ]month|growth|grew|grow)\b/i, 'growth'],
  [/\b(compare|comparison|versus|vs)\b/i, 'comparison'],
  [/\b(median|percentiles?|p\d{2}|quartiles?|correlat\w*|outliers?)\b/i, 'statistics'],
  [/\btop \d+ (\w+ )?(per|in each|for each|within)\b|\b(rank|ranking)\b/i, 'ranking'],
  [/\b(share of|percentage of|proportion)\b|%\s*of\b/i, 'shares'],
  [/\b(forecast|predict|regression|seasonal\w*)\b/i, 'forecasting'],
]

/** "and by month?", "what about 2024?", "only online": leans on the earlier answers. */
const FOLLOW_UP =
  /^(and|but|also|now|then|what about|how about|same|instead|only|just|excluding|without)\b/i

const SIMPLE =
  /^(how many|what('s| is) the (total|number|count|sum|average)|total|count|number of|list|show)\b/i

const LABELS: Record<RequestEffort, string> = { low: 'Low', medium: 'Medium', high: 'High' }

/** For the timeline: "High effort: running window". */
export function describeEffort(choice: EffortChoice): string {
  return `${LABELS[choice.effort]} effort: ${choice.reason}`
}

export function autoEffort(
  question: string,
  { tables, hasHistory }: { tables: number; hasHistory: boolean },
): EffortChoice {
  const text = question.trim()
  const words = text.split(/\s+/).filter(Boolean).length
  const hard = HARD.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason)
  if (hard.length > 0) return { effort: 'high', reason: hard.slice(0, 2).join(', ') }
  if (words > 25) return { effort: 'high', reason: 'long question' }
  if (tables > 1) return { effort: 'medium', reason: 'several tables' }
  if (hasHistory && (FOLLOW_UP.test(text) || words <= 4))
    return { effort: 'medium', reason: 'follow-up' }
  if (words <= 10 && SIMPLE.test(text)) return { effort: 'low', reason: 'simple total' }
  return { effort: 'medium', reason: 'typical question' }
}

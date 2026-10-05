// Command palette search (F-SHELL-07): every word of the query must appear in the command's label
// or keywords; matches at the start of the label or of a word rank first. Pure.

export interface Searchable {
  label: string
  group: string
  keywords?: string
}

const normalize = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

function score(item: Searchable, words: string[]): number | null {
  const label = normalize(item.label)
  const haystack = `${label} ${normalize(item.group)} ${normalize(item.keywords ?? '')}`
  let total = 0
  for (const word of words) {
    const index = haystack.indexOf(word)
    if (index === -1) return null
    if (label.startsWith(word)) total += 3
    else if (index < label.length && (index === 0 || /\W/.test(label[index - 1] ?? ''))) total += 2
    else if (index < label.length) total += 1
  }
  return total
}

/** Matching items, best first (stable for ties); everything, in order, for an empty query. */
export function searchCommands<T extends Searchable>(items: readonly T[], query: string): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...items]
  return items
    .map((item, index) => ({ item, index, score: score(item, words) }))
    .filter((entry): entry is { item: T; index: number; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item)
}

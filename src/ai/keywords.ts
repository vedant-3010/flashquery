// Keywords of a question, for picking related examples (F-ASK-19, F-ASK-20): lowercase words,
// without stop words, with plurals and common endings trimmed, so "orders" meets "order". Pure.

const STOP_WORDS = new Set(
  'a an and are as at be by did do does for from had has have how i in is it its me my of on or our show tell that the their them there these this to us was we were what when where which who why will with you your give list find get'.split(
    ' ',
  ),
)

function stem(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.endsWith('ing')) return word.slice(0, -3)
  if (word.endsWith('ed')) return word.slice(0, -2)
  if (word.endsWith('es') && /(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/** "Which regions grew fastest?" → {region, grew, fastest}. */
export function keywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
  return new Set(words.map(stem))
}

/** How many keywords two sets share. */
export function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared
}

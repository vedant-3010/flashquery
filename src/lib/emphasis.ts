// The numbers worth seeing first in an answer's headline (D118): drawn in the brand colour, as the
// landing page's film does ("APAC leads with +140%"). Pure.

export interface Part {
  text: string
  /** A number a reader looks for: a change, a share, money, or a figure with a scale. */
  number: boolean
}

// A signed, currency or plain number, with an optional scale or percent: "+140%", "$3.5M",
// "763.9K", "1,234", "€12.50", "-4.2 pts". \b keeps "Q1" and "H2" whole.
const NUMBER = /[+\-−]?[$€£¥₹]?\b\d[\d.,]*(?:\s?(?:%|[KMBT]\b|bn\b|pts?\b))?/g

/** A figure that stands out: signed, money, a percent, a scale, decimals or thousands. */
function notable(match: string): boolean {
  if (/^[+\-−]/.test(match) || /[$€£¥₹%]/.test(match) || /[KMBT]|bn|pt/.test(match)) return true
  const digits = match.replace(/[^\d.,]/g, '')
  // Years ("2025") and small counts ("5 regions") read better as plain text.
  if (/^\d+$/.test(digits)) return false
  return /[.,]/.test(digits)
}

export function splitNumbers(text: string): Part[] {
  const parts: Part[] = []
  let last = 0
  for (const match of text.matchAll(NUMBER)) {
    const value = match[0].replace(/[.,]+$/, '')
    if (!notable(value)) continue
    const at = match.index ?? 0
    if (at > last) parts.push({ text: text.slice(last, at), number: false })
    parts.push({ text: value, number: true })
    last = at + value.length
  }
  if (last < text.length) parts.push({ text: text.slice(last), number: false })
  return parts
}

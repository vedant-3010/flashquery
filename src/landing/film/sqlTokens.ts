// Syntax colouring for the SQL shown on the landing page: keywords, functions, numbers and strings.
// Small on purpose; it only has to read the demo query well. Pure.

export type SqlTokenKind = 'keyword' | 'function' | 'number' | 'string' | 'plain'

export interface SqlToken {
  kind: SqlTokenKind
  text: string
}

const KEYWORDS = new Set([
  'WITH',
  'AS',
  'SELECT',
  'FROM',
  'WHERE',
  'IN',
  'GROUP',
  'BY',
  'ALL',
  'FILTER',
  'ORDER',
  'DESC',
  'ASC',
  'AND',
  'OR',
  'LIMIT',
  'ON',
  'JOIN',
])
const TOKEN =
  /('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?|(\s+|[^\sA-Za-z0-9_']+)/g

export function sqlTokens(line: string): SqlToken[] {
  const out: SqlToken[] = []
  for (const match of line.matchAll(TOKEN)) {
    const [whole, string, number, word, call, other] = match
    if (string !== undefined) out.push({ kind: 'string', text: string })
    else if (number !== undefined) out.push({ kind: 'number', text: number })
    else if (word !== undefined) {
      const kind: SqlTokenKind = KEYWORDS.has(word.toUpperCase())
        ? 'keyword'
        : call !== undefined
          ? 'function'
          : 'plain'
      out.push({ kind, text: word })
      if (call !== undefined) out.push({ kind: 'plain', text: call })
    } else out.push({ kind: 'plain', text: other ?? whole })
  }
  return out
}

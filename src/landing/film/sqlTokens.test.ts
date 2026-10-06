import { describe, expect, it } from 'vitest'
import { sqlTokens } from './sqlTokens'

describe('landing SQL colouring', () => {
  it('splits a line into keywords, functions, numbers and the rest, losing nothing', () => {
    const line = "  SELECT region, year(order_date) AS yr FROM t WHERE x IN (2022, 'a''b')"
    const tokens = sqlTokens(line)
    expect(tokens.map((t) => t.text).join('')).toBe(line)
    const kinds = (kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text)
    expect(kinds('keyword')).toEqual(['SELECT', 'AS', 'FROM', 'WHERE', 'IN'])
    expect(kinds('function')).toEqual(['year'])
    expect(kinds('number')).toEqual(['2022'])
    expect(kinds('string')).toEqual(["'a''b'"])
  })
})

import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { accountError } from './errors'

describe('accountError (F-ACCT-01)', () => {
  it('turns known codes into plain words and keeps the original as detail', () => {
    const error = accountError({
      code: 'invalid_credentials',
      message: 'Invalid login credentials',
    })
    expect(error.toJSON()).toEqual({
      code: 'account',
      message: 'Wrong email or password.',
      detail: 'invalid_credentials: Invalid login credentials',
    })
  })

  it('says when the service is unreachable', () => {
    expect(accountError(new TypeError('Failed to fetch')).code).toBe('account_offline')
  })

  it('has a calm fallback and passes AppErrors through', () => {
    expect(accountError({ message: 'boom' }).message).toMatch(/didn't accept that/)
    const known = new AppError({ code: 'x', message: 'y', detail: null })
    expect(accountError(known)).toBe(known)
  })
})

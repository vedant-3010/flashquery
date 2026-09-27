import { describe, expect, it } from 'vitest'
import { AppError, toAppError } from './errors'

describe('toAppError', () => {
  it('returns an AppError unchanged', () => {
    const error = new AppError({
      code: 'engine_init',
      message: 'Engine failed to start.',
      detail: null,
    })
    expect(toAppError(error)).toBe(error)
  })

  it('revives plain AppError data (e.g. from a worker)', () => {
    const revived = toAppError({
      code: 'query_timeout',
      message: 'Query timed out.',
      detail: '30 s',
    })
    expect(revived).toBeInstanceOf(AppError)
    expect(revived.toJSON()).toEqual({
      code: 'query_timeout',
      message: 'Query timed out.',
      detail: '30 s',
    })
  })

  it('wraps an Error with a friendly message and technical detail', () => {
    const wrapped = toAppError(new TypeError('x is undefined'), 'render')
    expect(wrapped.code).toBe('render')
    expect(wrapped.message).toBe('Something went wrong.')
    expect(wrapped.detail).toBe('TypeError: x is undefined')
  })

  it('describes non-Error values', () => {
    expect(toAppError('boom').detail).toBe('boom')
    expect(toAppError({ reason: 'nope' }).detail).toBe('{"reason":"nope"}')
    expect(toAppError(undefined).detail).toBe('undefined')
    expect(toAppError(10n).detail).toBe('10')
  })
})

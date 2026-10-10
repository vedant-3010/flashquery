import { describe, expect, it } from 'vitest'
import { parseServiceUrl, serviceConnectSources } from './serviceUrl'

describe('account service URL (F-SEC-08)', () => {
  it('accepts a bare https origin', () => {
    expect(parseServiceUrl('https://abcd.supabase.co')?.host).toBe('abcd.supabase.co')
    expect(parseServiceUrl('https://auth.example.com/')?.host).toBe('auth.example.com')
  })

  it('accepts plain http only for a local service (supabase start)', () => {
    expect(parseServiceUrl('http://127.0.0.1:54321')?.host).toBe('127.0.0.1:54321')
    expect(parseServiceUrl('http://localhost:54321')?.host).toBe('localhost:54321')
    expect(parseServiceUrl('http://abcd.supabase.co')).toBeNull()
    expect(parseServiceUrl('http://192.168.1.5:54321')).toBeNull()
    expect(serviceConnectSources('http://127.0.0.1:54321')).toEqual([
      'http://127.0.0.1:54321',
      'ws://127.0.0.1:54321',
    ])
  })

  it.each([
    undefined,
    '',
    'nope',
    'http://abcd.supabase.co',
    'https://abcd.supabase.co/rest',
    'https://*.supabase.co',
    'https://a.supabase.co?x=1',
  ])('rejects %s', (value) => {
    expect(parseServiceUrl(value)).toBeNull()
  })

  it('names exactly that host in the CSP, https and wss, never a wildcard', () => {
    expect(serviceConnectSources('https://abcd.supabase.co')).toEqual([
      'https://abcd.supabase.co',
      'wss://abcd.supabase.co',
    ])
    expect(serviceConnectSources(undefined)).toEqual([])
    expect(() => serviceConnectSources('https://*.supabase.co')).toThrow(/https origin/)
  })
})

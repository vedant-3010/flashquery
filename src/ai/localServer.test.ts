import { describe, expect, it } from 'vitest'
import { localBaseUrl } from './localServer'

describe('local server URLs (F-AI-06)', () => {
  it('accepts http(s) on localhost and 127.0.0.1, normalized', () => {
    expect(localBaseUrl(' http://localhost:11434/v1/ ')).toBe('http://localhost:11434/v1')
    expect(localBaseUrl('http://127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1')
    expect(localBaseUrl('https://localhost/v1?x=1')).toBe('https://localhost/v1')
  })

  it('refuses other hosts, schemes and credentials', () => {
    expect(localBaseUrl('https://api.example.com/v1')).toBeNull()
    expect(localBaseUrl('http://localhost.evil.com/v1')).toBeNull()
    expect(localBaseUrl('http://192.168.1.5:11434/v1')).toBeNull()
    expect(localBaseUrl('ftp://localhost/v1')).toBeNull()
    expect(localBaseUrl('http://user:pass@localhost:11434/v1')).toBeNull()
    expect(localBaseUrl('not a url')).toBeNull()
  })
})

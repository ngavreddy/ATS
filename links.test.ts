import { describe, it, expect } from 'vitest'
import { hashToken, newToken } from '../links'
import { esc } from '../email'

describe('magic-link tokens', () => {
  it('generates url-safe tokens with 256 bits of randomness', () => {
    const { token } = newToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
  it('is unique every time', () => {
    const set = new Set(Array.from({ length: 500 }, () => newToken().token))
    expect(set.size).toBe(500)
  })
  it('stores a hash, never the token itself', () => {
    const { token, hash } = newToken()
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(hash).toBe(hashToken(token))
  })
  it('hashing is deterministic and sensitive to a single character', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })
})

describe('esc (HTML escaping for email bodies)', () => {
  it('neutralizes markup in names and text', () => {
    expect(esc(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;')
  })
  it('leaves normal text alone', () => expect(esc('Priya Raman')).toBe('Priya Raman'))
})

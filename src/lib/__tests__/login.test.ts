import { describe, it, expect } from 'vitest'
import { loginHint } from '../login'

describe('loginHint', () => {
  it('explains an unconfirmed email', () => {
    expect(loginHint('Email not confirmed')).toContain('confirm')
  })
  it('explains wrong credentials and points at the email match', () => {
    expect(loginHint('Invalid login credentials')).toContain('Users list')
  })
  it('recognises a bad or missing Supabase key or URL', () => {
    for (const m of ['Invalid API key', 'invalid JWT: unable to parse', "Your project's URL and Key are required to create a Supabase client!", 'fetch failed'])
      expect(loginHint(m)).toContain('Netlify')
  })
  it('is case-insensitive', () => expect(loginHint('EMAIL NOT CONFIRMED')).not.toBeNull())
  it('gives no hint for unknown errors, so the raw message speaks for itself', () => {
    expect(loginHint('Something odd')).toBeNull()
    expect(loginHint('')).toBeNull()
    expect(loginHint(undefined)).toBeNull()
  })
})

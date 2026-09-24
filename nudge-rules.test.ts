import { describe, it, expect } from 'vitest'
import { nudgeDue } from '../nudge-rules'

const NOW = Date.parse('2026-09-23T12:00:00Z')
const ago = (h: number) => new Date(NOW - h * 36e5)

describe('nudgeDue', () => {
  it('first nudge at 24h', () => {
    expect(nudgeDue('client', 0, ago(23.9), NOW)).toBe(false)
    expect(nudgeDue('client', 0, ago(24), NOW)).toBe(true)
  })
  it('second nudge at 48h, and not before', () => {
    expect(nudgeDue('client', 1, ago(30), NOW)).toBe(false)
    expect(nudgeDue('client', 1, ago(48), NOW)).toBe(true)
  })
  it('stops after two nudges (a call is the next step)', () => {
    expect(nudgeDue('client', 2, ago(200), NOW)).toBe(false)
  })
  it('does not skip straight to the second nudge if the first was missed', () => {
    expect(nudgeDue('client', 0, ago(72), NOW)).toBe(true) // sends nudge 1, counter -> 1
  })
  it('never nudges the client when the stage is waiting on someone else', () => {
    for (const w of ['agency', 'candidate', null, undefined]) expect(nudgeDue(w as never, 0, ago(100), NOW)).toBe(false)
  })
  it('accepts ISO strings from the database', () => {
    expect(nudgeDue('client', 0, ago(25).toISOString(), NOW)).toBe(true)
  })
})

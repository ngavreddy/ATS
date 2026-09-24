import { describe, it, expect } from 'vitest'
import { computeFee, guaranteeMilestones, invoiceDates } from '../fees'

describe('computeFee', () => {
  it('matches the placement mockup: $180,000 x 20% = $36,000', () => {
    expect(computeFee(180000, 20)).toBe(36000)
  })
  it('handles the other MSA rates in the contracts mockup', () => {
    expect(computeFee(165000, 22)).toBe(36300)
    expect(computeFee(190000, 20)).toBe(38000)
  })
  it('handles fractional percentages without floating-point drift', () => {
    expect(computeFee(100000, 18.5)).toBe(18500)
    expect(computeFee(123457, 22.5)).toBe(27777.83) // 27,777.825 rounds to the cent
  })
  it('never returns more than 2 decimals', () => {
    const fee = computeFee(133333, 17.3)
    expect(Math.round(fee * 100)).toBeCloseTo(fee * 100, 6)
  })
})

describe('invoiceDates', () => {
  it('issues on start date and is due after the net terms (mockup: Oct 19, Net 30 -> Nov 18)', () => {
    expect(invoiceDates('2026-10-19', 30)).toEqual({ issue: '2026-10-19', due: '2026-11-18' })
  })
  it('supports Net 15', () => {
    expect(invoiceDates('2026-10-19', 15).due).toBe('2026-11-03')
  })
})

describe('guaranteeMilestones', () => {
  it('matches the placement mockup timeline', () => {
    expect(guaranteeMilestones('2026-10-19', '2027-01-17')).toEqual([
      ['Start', '2026-10-19'],
      ['30-day check-in', '2026-11-18'],
      ['60-day check-in', '2026-12-18'],
      ['Reminder', '2027-01-03'],
      ['Ends', '2027-01-17'],
    ])
  })
})

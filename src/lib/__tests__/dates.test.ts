import { describe, it, expect } from 'vitest'
import { addDays, daysBetween, fmt, today } from '../dates'

describe('addDays', () => {
  it('matches the placement mockup: Oct 19 + 90 days = Jan 17', () => {
    expect(addDays('2026-10-19', 90)).toBe('2027-01-17')
  })
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })
  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })
  it('subtracts', () => {
    expect(addDays('2027-01-17', -14)).toBe('2027-01-03')
  })
  it('is not thrown off by daylight saving changes', () => {
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })
})

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-09-23', '2026-10-05')).toBe(12)
    expect(daysBetween('2026-10-05', '2026-09-23')).toBe(-12)
    expect(daysBetween('2026-09-23', '2026-09-23')).toBe(0)
  })
})

describe('today (agency timezone, not UTC)', () => {
  it('9pm Chicago on Sep 23 is still Sep 23, though UTC has rolled to Sep 24', () => {
    const nineOclockChicago = new Date('2026-09-24T02:00:00Z')
    expect(today(nineOclockChicago, 'America/Chicago')).toBe('2026-09-23')
  })
  it('uses standard time in winter', () => {
    expect(today(new Date('2026-01-15T05:59:00Z'), 'America/Chicago')).toBe('2026-01-14')
    expect(today(new Date('2026-01-15T06:00:00Z'), 'America/Chicago')).toBe('2026-01-15')
  })
})

describe('fmt', () => {
  it('shows date-only values as-is, never shifted by timezone', () => {
    expect(fmt('2026-10-19', 'America/Chicago')).toBe('Oct 19')
    expect(fmt('2026-10-19', 'Pacific/Auckland')).toBe('Oct 19')
  })
  it('shows timestamps in the agency timezone', () => {
    expect(fmt('2026-09-24T02:00:00Z', 'America/Chicago')).toBe('Sep 23')
  })
})

import { describe, it, expect } from 'vitest'
import { benefitsSummary, hasAnyBenefit, normalizeBenefits } from '../benefits'

describe('benefitsSummary', () => {
  it('reads like a posting', () => {
    const { benefits } = normalizeBenefits({ health: true, dental: true, vision: true, retirement: true, retirement_match_pct: 6, pto: { type: 'days', days: 20 }, holidays: 10 })
    expect(benefitsSummary(benefits)).toBe('Medical, dental and vision; 401(k) with 6% match; 20 days PTO; 10 paid holidays')
  })
  it('joins one, two and three insurances correctly', () => {
    expect(benefitsSummary({ health: true })).toBe('Medical')
    expect(benefitsSummary({ health: true, vision: true })).toBe('Medical and vision')
    expect(benefitsSummary({ health: true, dental: true, vision: true })).toBe('Medical, dental and vision')
  })
  it('unlimited PTO', () => expect(benefitsSummary({ pto: { type: 'unlimited' } })).toBe('Unlimited PTO'))
  it('401(k) with no match', () => expect(benefitsSummary({ retirement: true })).toBe('401(k)'))
  it('additional benefits are added at the end', () =>
    expect(benefitsSummary({ health: true }, '  Gym stipend; free lunch ')).toBe('Medical; Also: Gym stipend; free lunch'))
  it('additional benefits alone are enough', () => expect(benefitsSummary({}, 'Four-day summer weeks')).toBe('Also: Four-day summer weeks'))
  it('nothing selected gives an empty summary, which the pay gate then refuses', () => expect(benefitsSummary({})).toBe(''))
  it('every checkbox has wording', () => {
    const all = normalizeBenefits({ health: true, dental: true, vision: true, life: true, disability: true, hsa_fsa: true, retirement: true, equity: true,
      parental_leave: true, tuition: true, wellness: true, commuter: true, pto: { type: 'unlimited' }, holidays: 9 }).benefits
    const s = benefitsSummary(all)
    for (const word of ['Medical', 'Life insurance', 'Disability insurance', 'HSA/FSA', '401(k)', 'Equity', 'Unlimited PTO', '9 paid holidays', 'Paid parental leave', 'Tuition assistance', 'Wellness program', 'Commuter benefits'])
      expect(s).toContain(word)
  })
})

describe('normalizeBenefits', () => {
  it('keeps only the checked items', () => expect(normalizeBenefits({ health: true, dental: false, vision: 'yes' }).benefits).toEqual({ health: true }))
  it('drops keys it does not know', () => expect(normalizeBenefits({ health: true, salary: 999, __proto__: { x: 1 } }).benefits).toEqual({ health: true }))
  it('survives garbage input', () => {
    for (const bad of [null, undefined, 'x', 5, [], [1, 2]]) expect(normalizeBenefits(bad)).toEqual({ benefits: {}, errors: [] })
  })
  it('PTO days must be a whole number from 1 to 365', () => {
    expect(normalizeBenefits({ pto: { type: 'days', days: 20 } }).benefits.pto).toEqual({ type: 'days', days: 20 })
    for (const d of [0, 366, 2.5, 'lots', -3, null]) expect(normalizeBenefits({ pto: { type: 'days', days: d } }).errors[0]).toContain('PTO days')
  })
  it('an unknown PTO type is ignored', () => expect(normalizeBenefits({ pto: { type: 'sabbatical' } }).benefits.pto).toBeUndefined())
  it('the 401(k) match only counts when 401(k) is ticked, and must be 0 to 100', () => {
    expect(normalizeBenefits({ retirement_match_pct: 6 }).benefits).toEqual({})
    expect(normalizeBenefits({ retirement: true, retirement_match_pct: 4.55 }).benefits.retirement_match_pct).toBe(4.6)
    expect(normalizeBenefits({ retirement: true, retirement_match_pct: 150 }).errors[0]).toContain('401(k) match')
    expect(normalizeBenefits({ retirement: true, retirement_match_pct: 'x' }).errors[0]).toContain('401(k) match')
    expect(normalizeBenefits({ retirement: true, retirement_match_pct: '' }).errors).toEqual([])
  })
  it('paid holidays are whole numbers from 0 to 30, and zero means none', () => {
    expect(normalizeBenefits({ holidays: 11 }).benefits.holidays).toBe(11)
    expect(normalizeBenefits({ holidays: 0 }).benefits.holidays).toBeUndefined()
    expect(normalizeBenefits({ holidays: 31 }).errors[0]).toContain('holidays')
  })
})

describe('hasAnyBenefit', () => {
  it('needs at least one choice or some additional text', () => {
    expect(hasAnyBenefit({}, '')).toBe(false)
    expect(hasAnyBenefit({}, '   ')).toBe(false)
    expect(hasAnyBenefit({ health: true }, '')).toBe(true)
    expect(hasAnyBenefit({}, 'Gym')).toBe(true)
    expect(hasAnyBenefit({ pto: { type: 'unlimited' } }, null)).toBe(true)
  })
})

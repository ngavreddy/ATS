import { describe, it, expect } from 'vitest'
import { composeHeadline, fullName, greetingName, locationLabel } from '../names'
import { US_STATES, normalizeState } from '../us-states'

describe('names', () => {
  it('greets by preferred name, then first name', () => {
    expect(greetingName({ first_name: 'Priyanka', preferred_name: 'Pri', full_name: 'Priyanka Raman' })).toBe('Pri')
    expect(greetingName({ first_name: 'Priyanka', preferred_name: '  ', full_name: 'Priyanka Raman' })).toBe('Priyanka')
  })
  it('older records only have a full name', () => expect(greetingName({ full_name: 'Kenji Watanabe' })).toBe('Kenji'))
  it('never crashes on an empty record', () => expect(greetingName({})).toBe(''))
  it('the full name comes from first + last, or the old field', () => {
    expect(fullName({ first_name: 'Priya', last_name: 'Raman', full_name: 'stale' })).toBe('Priya Raman')
    expect(fullName({ first_name: 'Cher', last_name: null })).toBe('Cher')
    expect(fullName({ full_name: 'Old Record' })).toBe('Old Record')
  })
})

describe('locationLabel', () => {
  it('City, ST', () => expect(locationLabel({ city: 'Chicago', state: 'IL' })).toBe('Chicago, IL'))
  it('falls back to the old metro text', () => expect(locationLabel({ metro: 'Chicago metro' })).toBe('Chicago metro'))
  it('never shows the street address or ZIP, because they are not even in its input', () =>
    expect(locationLabel({ city: 'Chicago', state: 'IL', ...({ postal_code: '60614', address_line: '1 Main' } as object) })).toBe('Chicago, IL'))
  it('empty is empty', () => expect(locationLabel({})).toBe(''))
})

describe('composeHeadline', () => {
  it('title at employer with years', () => expect(composeHeadline({ title: 'Senior Data Engineer', employer: 'Meridian Grocers', years: 8 })).toBe('Senior Data Engineer at Meridian Grocers · 8 yrs'))
  it('handles gaps', () => {
    expect(composeHeadline({ title: 'Designer' })).toBe('Designer')
    expect(composeHeadline({ employer: 'Halvorsen' })).toBe('Halvorsen')
    expect(composeHeadline({ title: 'Designer', years: 0 })).toBe('Designer · 0 yrs')
    expect(composeHeadline({ years: 5 })).toBeNull()
    expect(composeHeadline({})).toBeNull()
  })
})

describe('states', () => {
  it('has 50 states plus DC', () => expect(US_STATES).toHaveLength(51))
  it.each([['il', 'IL'], ['IL', 'IL'], ['Illinois', 'IL'], ['illinois', 'IL'], ['I.L.', 'IL'], [' wi ', 'WI'], ['District of Columbia', 'DC']])('%s -> %s', (i, o) => expect(normalizeState(i)).toBe(o))
  it.each(['', 'Chicago', 'ZZ', 'Ill', null, undefined])('%j -> null', (i) => expect(normalizeState(i as string)).toBeNull())
})

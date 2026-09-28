import { describe, it, expect } from 'vitest'
import { formatPhone, normalizeEmail, parseCandidate, parseList, prefsOf } from '../candidate'

const good = { first_name: 'Priya', last_name: 'Raman', email: 'Priya.Raman@Example.com', city: 'Chicago', state: 'IL' }

describe('parseCandidate: required fields', () => {
  it('a minimal candidate is accepted', () => {
    const r = parseCandidate(good)
    expect(r.errors).toEqual([])
    expect(r.data).toMatchObject({ first_name: 'Priya', last_name: 'Raman', email: 'priya.raman@example.com', city: 'Chicago', state: 'IL', preferred_name: null, source: null })
  })
  it.each([['first_name', 'First name'], ['last_name', 'Last name'], ['city', 'City'], ['state', 'State']])('%s is required', (key, label) => {
    const r = parseCandidate({ ...good, [key]: '   ' })
    expect(r.data).toBeNull()
    expect(r.errors.join(' ')).toContain(label)
  })
  it('reports every problem at once, not one at a time', () => expect(parseCandidate({}).errors.length).toBeGreaterThanOrEqual(4))
  it('needs a way to reach them', () => expect(parseCandidate({ ...good, email: '' }).errors).toContain('Add an email or a phone number so you can reach them.'))
  it('a phone number alone is enough', () => expect(parseCandidate({ ...good, email: '', phone: '3125550142' }).errors).toEqual([]))
  it('a badly typed email is called out, not silently dropped', () => expect(parseCandidate({ ...good, email: 'priya@' }).errors.join(' ')).toContain("email address doesn't look right"))
})

describe('parseCandidate: location', () => {
  it('accepts the state name or code in any case', () => {
    for (const s of ['il', 'IL', 'Illinois']) expect(parseCandidate({ ...good, state: s }).data?.state).toBe('IL')
  })
  it('rejects things that are not states', () => expect(parseCandidate({ ...good, state: 'Chicago' }).errors.join(' ')).toContain('Choose a US state'))
  it('street address and ZIP are optional, and ZIP must be well formed', () => {
    expect(parseCandidate({ ...good, address_line: '742 Evergreen Terrace', postal_code: '60614' }).data).toMatchObject({ address_line: '742 Evergreen Terrace', postal_code: '60614' })
    expect(parseCandidate({ ...good, postal_code: '60614-1234' }).errors).toEqual([])
    expect(parseCandidate({ ...good, postal_code: '6061' }).errors.join(' ')).toContain('ZIP')
  })
})

describe('parseCandidate: profile fields', () => {
  const full = {
    ...good, preferred_name: ' Pri ', phone: '312.555.0142', linkedin_url: 'linkedin.com/in/priya', current_title: 'Senior Data Engineer', current_employer: 'Meridian Grocers',
    years_experience: '8', skills: 'Spark, Python; SQL\nspark', target_titles: 'Staff Data Engineer', dealbreakers: 'no travel, No RTO',
    comp_floor: '185k', work_models: ['hybrid', 'remote', 'teleport'], willing_to_relocate: 'on', notice_period: '3-4w',
    work_authorization: 'no_sponsorship_needed', source: 'referral', referred_by: ' Jordan Kim ',
  }
  it('cleans and types everything', () => {
    expect(parseCandidate(full).data).toEqual({
      first_name: 'Priya', last_name: 'Raman', preferred_name: 'Pri', email: 'priya.raman@example.com', phone: '(312) 555-0142',
      linkedin_url: 'https://linkedin.com/in/priya', address_line: null, city: 'Chicago', state: 'IL', postal_code: null,
      current_title: 'Senior Data Engineer', current_employer: 'Meridian Grocers', years_experience: 8,
      headline: 'Senior Data Engineer at Meridian Grocers · 8 yrs',
      skills: ['Spark', 'Python', 'SQL'], target_titles: ['Staff Data Engineer'], dealbreakers: ['no travel', 'No RTO'],
      comp_floor: 185000, work_models: ['hybrid', 'remote'], willing_to_relocate: true, notice_period: '3-4w',
      work_authorization: 'no_sponsorship_needed', source: 'referral', referred_by: 'Jordan Kim',
    })
  })
  it('"referred by" is only kept for referrals', () => expect(parseCandidate({ ...full, source: 'applicant' }).data?.referred_by).toBeNull())
  it('unticked relocate means no', () => expect(parseCandidate({ ...good, willing_to_relocate: '' }).data?.willing_to_relocate).toBe(false))
  it.each([
    [{ source: 'cold call' }, 'Sourced, Referral or Applicant'], [{ notice_period: 'whenever' }, 'notice period'], [{ work_authorization: 'maybe' }, 'work authorization'],
    [{ years_experience: '-2' }, 'Years of experience'], [{ years_experience: '2.5' }, 'Years of experience'], [{ comp_floor: 'lots' }, 'base salary'],
    [{ linkedin_url: 'http://' }, 'LinkedIn'],
  ])('%j is refused', (patch, fragment) => expect(parseCandidate({ ...good, ...patch }).errors.join(' ')).toContain(fragment))
})

describe('helpers', () => {
  it('parseList splits on commas, semicolons and new lines, and removes repeats', () => expect(parseList('a, b;c\nB,  ,d')).toEqual(['a', 'b', 'c', 'd']))
  it('parseList caps the number and length', () => {
    expect(parseList(Array.from({ length: 50 }, (_, i) => `s${i}`).join(','))).toHaveLength(30)
    expect(parseList('x'.repeat(200))[0]).toHaveLength(80)
  })
  it('emails are lower-cased and validated', () => { expect(normalizeEmail(' A@B.co ')).toBe('a@b.co'); expect(normalizeEmail('nope')).toBeNull() })
  it.each(['3125550142', '312-555-0142', '(312) 555-0142', '312.555.0142', '+1 312 555 0142', '1-312-555-0142'])('phone %s is stored one way', (p) => expect(formatPhone(p)).toBe('(312) 555-0142'))
  it('phones it cannot make sense of are kept as typed', () => { expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958'); expect(formatPhone('')).toBeNull() })
})

describe('prefsOf (the hard filters used when submitting)', () => {
  it('reads the new columns', () => expect(prefsOf({ comp_floor: 185000, work_models: ['remote'], dealbreakers: ['no RTO'] })).toEqual({ comp_floor: 185000, work_models: ['remote'], dealbreakers: ['no RTO'] }))
  it('falls back to the old json column for candidates saved before', () =>
    expect(prefsOf({ comp_floor: null, work_models: [], dealbreakers: [], prefs: { comp_floor: 150000, work_models: ['onsite'], dealbreakers: ['travel'] } }))
      .toEqual({ comp_floor: 150000, work_models: ['onsite'], dealbreakers: ['travel'] }))
})

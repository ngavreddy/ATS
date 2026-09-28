import { describe, it, expect } from 'vitest'
import { parseClientForm, parseContactForm, parseContractForm } from '../client-form'

describe('parseClientForm', () => {
  it('a name is enough; status defaults to active', () => expect(parseClientForm({ name: ' Northwind Logistics ' }).data).toEqual({ name: 'Northwind Logistics', status: 'active', industry: null, website: null, city: null, state: null }))
  it('cleans website and state', () => expect(parseClientForm({ name: 'A', website: 'northwind.com', state: 'illinois', status: 'prospect' }).data).toMatchObject({ website: 'https://northwind.com/', state: 'IL', status: 'prospect' }))
  it.each([[{ name: '' }, 'name is required'], [{ name: 'A', status: 'dead' }, 'Prospect, Active or Inactive'], [{ name: 'A', state: 'Narnia' }, 'US state'], [{ name: 'A', website: 'http://' }, 'website']])('%j', (v, frag) => expect(parseClientForm(v).errors.join(' ')).toContain(frag))
})

describe('parseContactForm', () => {
  const ok = { name: 'Dana Whitaker', email: 'Dana@Northwind.com', phone: '3125550142' }
  it('a hiring manager with an email', () => expect(parseContactForm(ok).data).toEqual({ name: 'Dana Whitaker', email: 'dana@northwind.com', phone: '(312) 555-0142', title: null, role: 'hiring_manager', is_primary: false, notes: null }))
  it('reads prefixed fields on the new-client form', () => expect(parseContactForm({ c_name: 'Dana', c_email: 'd@x.co', c_primary: 'on' }, 'c_').data).toMatchObject({ name: 'Dana', is_primary: true }))
  it('a hiring manager needs an email, but a billing contact does not', () => {
    expect(parseContactForm({ name: 'Dana' }).errors.join(' ')).toContain('needs an email')
    expect(parseContactForm({ name: 'Ana', role: 'billing' }).errors).toEqual([])
  })
  it('refuses a bad role, a bad email and no name', () => {
    expect(parseContactForm({ ...ok, role: 'janitor' }).errors.join(' ')).toContain('role')
    expect(parseContactForm({ ...ok, email: 'dana@' }).errors.join(' ')).toContain("email address doesn't look right")
    expect(parseContactForm({ email: 'a@b.co' }).errors.join(' ')).toContain('name is required')
  })
})

describe('parseContractForm', () => {
  it('a blank fee means no contract yet, which is allowed', () => expect(parseContractForm({ fee_pct: '' })).toEqual({ data: null, errors: [] }))
  it('fills sensible defaults', () => expect(parseContractForm({ fee_pct: '22' }).data).toEqual({ fee: 22, guarantee: 90, terms: 30, noncirc: 12, renewal: null }))
  it('reads every field', () => expect(parseContractForm({ fee_pct: '17.5', guarantee_days: '60', terms: '45', noncirc: '6', renewal: '2027-03-01' }).data).toEqual({ fee: 17.5, guarantee: 60, terms: 45, noncirc: 6, renewal: '2027-03-01' }))
  it.each([[{ fee_pct: '0' }, 'Fee'], [{ fee_pct: '101' }, 'Fee'], [{ fee_pct: 'x' }, 'Fee'], [{ fee_pct: '20', guarantee_days: '-1' }, 'Guarantee'], [{ fee_pct: '20', terms: '2.5' }, 'Net terms'], [{ fee_pct: '20', renewal: '03/01/2027' }, 'Renewal']])('%j is refused', (v, frag) => expect(parseContractForm(v).errors.join(' ')).toContain(frag))
})

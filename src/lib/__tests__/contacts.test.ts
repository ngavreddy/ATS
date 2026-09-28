import { describe, it, expect } from 'vitest'
import { defaultManager, hiringManagersFor, type Contact } from '../contacts'

const c = (o: Partial<Contact> & { id: string; name: string }): Contact => ({ client_id: 'nw', role: 'hiring_manager', is_primary: false, status: 'active', ...o })
const all: Contact[] = [
  c({ id: '1', name: 'Rob Castillo' }),
  c({ id: '2', name: 'Dana Whitaker', is_primary: true }),
  c({ id: '3', name: 'Ana Billing', role: 'billing' }),
  c({ id: '4', name: 'Left Company', status: 'inactive' }),
  c({ id: '5', name: 'Marcus Ortiz', client_id: 'hh', is_primary: true }),
  c({ id: '6', name: 'Exec Sponsor', role: 'executive' }),
]

describe('hiringManagersFor (the dropdown on a new req)', () => {
  it('lists only active hiring managers of the chosen client', () => expect(hiringManagersFor(all, 'nw').map((x) => x.id)).toEqual(['2', '1']))
  it('never includes another client\'s people', () => expect(hiringManagersFor(all, 'nw').some((x) => x.id === '5')).toBe(false))
  it('leaves out billing contacts, executives and people who left', () => {
    const ids = hiringManagersFor(all, 'nw').map((x) => x.id)
    for (const skip of ['3', '4', '6']) expect(ids).not.toContain(skip)
  })
  it('puts the primary contact first, then alphabetical', () => {
    const list = hiringManagersFor([c({ id: 'a', name: 'Zed' }), c({ id: 'b', name: 'Amy' }), c({ id: 'p', name: 'Pat', is_primary: true })], 'nw')
    expect(list.map((x) => x.name)).toEqual(['Pat', 'Amy', 'Zed'])
  })
  it('an unknown client has none', () => expect(hiringManagersFor(all, 'nope')).toEqual([]))
})

describe('defaultManager', () => {
  it('pre-selects the primary contact', () => expect(defaultManager(hiringManagersFor(all, 'nw'))).toBe('2'))
  it('pre-selects the only one', () => expect(defaultManager([c({ id: 'x', name: 'Solo' })])).toBe('x'))
  it('makes you choose when there are several and none is primary', () => expect(defaultManager([c({ id: 'a', name: 'A' }), c({ id: 'b', name: 'B' })])).toBe(''))
  it('nobody to pick', () => expect(defaultManager([])).toBe(''))
})

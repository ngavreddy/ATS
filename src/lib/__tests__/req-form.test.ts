import { describe, it, expect } from 'vitest'
import { parseReqForm } from '../req-form'

const base = { title: 'Staff Data Engineer', client_id: 'c1', pay_min: '135k', pay_max: '155,000', benefits_json: JSON.stringify({ health: true, dental: true, pto: { type: 'unlimited' } }) }
const draft = { publish: false, isNew: true }, publish = { publish: true, isNew: true }

describe('parseReqForm', () => {
  it('builds the row, and writes the benefits summary itself', () => {
    const r = parseReqForm({ ...base, benefits_other: 'Gym stipend', bonus_note: '10% target', must_haves: 'Spark\n\n dbt \n' }, publish)
    expect(r.errors).toEqual([])
    expect(r.data).toMatchObject({
      title: 'Staff Data Engineer', pay_min: 135000, pay_max: 155000, bonus_note: '10% target', work_model: 'onsite', placement_type: 'FTE',
      benefits: { health: true, dental: true, pto: { type: 'unlimited' } }, benefits_other: 'Gym stipend',
      benefits_summary: 'Medical and dental; Unlimited PTO; Also: Gym stipend', must_haves: ['Spark', 'dbt'], hiring_manager_id: null,
    })
  })
  it('ignores a benefits_summary sent by the browser', () => expect(parseReqForm({ ...base, benefits_summary: 'Free yachts' }, publish).data?.benefits_summary).not.toContain('yachts'))
  it('a draft only needs a title and a client', () => {
    expect(parseReqForm({ title: 'X', client_id: 'c1' }, draft).errors).toEqual([])
    expect(parseReqForm({}, draft).errors).toEqual(['Title is required.', 'Choose a client.'])
  })
  it('editing does not ask for the client again', () => expect(parseReqForm({ title: 'X' }, { publish: false, isNew: false }).errors).toEqual([]))
  it('publishing needs the full pay range and a benefit', () => {
    const r = parseReqForm({ title: 'X', client_id: 'c1', pay_min: '100k' }, publish)
    expect(r.data).toBeNull()
    expect(r.errors.join(' ')).toContain('both ends of the pay range')
    expect(r.errors.join(' ')).toContain('at least one benefit')
  })
  it('the additional-benefits box alone satisfies the benefits rule', () => expect(parseReqForm({ ...base, benefits_json: '{}', benefits_other: 'Profit sharing' }, publish).errors).toEqual([]))
  it('a backwards pay range is refused, and so are unreadable numbers', () => {
    expect(parseReqForm({ ...base, pay_min: '200k', pay_max: '100k' }, draft).errors.join(' ')).toContain('backwards')
    expect(parseReqForm({ ...base, pay_min: 'lots' }, draft).errors.join(' ')).toContain('Base from')
  })
  it('surfaces benefit mistakes such as PTO days out of range', () =>
    expect(parseReqForm({ ...base, benefits_json: JSON.stringify({ pto: { type: 'days', days: 900 } }) }, draft).errors.join(' ')).toContain('PTO days'))
  it('survives a mangled benefits field', () => expect(parseReqForm({ ...base, benefits_json: '{not json' }, draft).errors).toEqual([]))
  it('refuses unknown work models and placement types', () => {
    expect(parseReqForm({ ...base, work_model: 'moon' }, draft).errors.join(' ')).toContain('Onsite, Hybrid or Remote')
    expect(parseReqForm({ ...base, placement_type: 'gig' }, draft).errors.join(' ')).toContain('placement type')
  })
})

import { describe, it, expect } from 'vitest'
import { fit, type Prefs } from '../filters'

const prefs: Prefs = { comp_floor: 185000, work_models: ['hybrid', 'remote'] }

describe('fit (hard filters)', () => {
  it('passes a role inside the candidate\'s constraints', () => {
    expect(fit(prefs, { pay_max: 220000, work_model: 'hybrid' })).toEqual({ ok: true, reasons: [] })
  })
  it('blocks a role whose top of range is below the floor (mockup: Halvorsen $150-175k vs $185k)', () => {
    const r = fit(prefs, { pay_max: 175000, work_model: 'hybrid' })
    expect(r.ok).toBe(false)
    expect(r.reasons).toEqual(['Below $185k floor'])
  })
  it('allows a role whose max equals the floor exactly', () => {
    expect(fit(prefs, { pay_max: 185000, work_model: 'hybrid' }).ok).toBe(true)
  })
  it('blocks an unacceptable work model', () => {
    const r = fit(prefs, { pay_max: 220000, work_model: 'onsite' })
    expect(r.ok).toBe(false)
    expect(r.reasons[0]).toContain('onsite')
  })
  it('reports every broken filter, not just the first', () => {
    expect(fit(prefs, { pay_max: 100000, work_model: 'onsite' }).reasons).toHaveLength(2)
  })
  it('does not block when the role has no stated pay or work model yet', () => {
    expect(fit(prefs, { pay_max: null, work_model: null }).ok).toBe(true)
  })
  it('does not filter on unset preferences', () => {
    expect(fit({}, { pay_max: 50000, work_model: 'onsite' }).ok).toBe(true)
    expect(fit({ work_models: [] }, { pay_max: 50000, work_model: 'onsite' }).ok).toBe(true)
  })
  it('never uses ZIP codes (Illinois HB 3773): extra location fields change nothing', () => {
    const withZip = { ...prefs, zip: '60601', commute_zip: '60601' } as Prefs
    const role = { pay_max: 220000, work_model: 'hybrid', zip: '60644' }
    expect(fit(withZip, role)).toEqual(fit(prefs, role))
  })
})

import { describe, it, expect } from 'vitest'
import { DEFAULT_STAGES, freshness } from '../workflow'

const active = (i: number) => ({ stage_index: i, status: 'active' })
const closed = (i: number) => ({ stage_index: i, status: 'closed' })

describe('DEFAULT_STAGES', () => {
  it('has a client-waiting review stage with an SLA, and no SLA on the first or last stage', () => {
    expect(DEFAULT_STAGES[0].sla_days).toBeNull()
    expect(DEFAULT_STAGES[DEFAULT_STAGES.length - 1].sla_days).toBeNull()
    expect(DEFAULT_STAGES[1]).toMatchObject({ name: 'Client review', waits_on: 'client' })
    expect(DEFAULT_STAGES[1].sla_days).toBeGreaterThan(0)
  })
})

describe('scorecard stages', () => {
  it('interview stages open a scorecard automatically; screening and offer stages do not', () => {
    const flagged = DEFAULT_STAGES.filter((s) => s.scorecard).map((s) => s.name)
    expect(flagged).toEqual(['Interview 1', 'Final round'])
  })
})

describe('freshness (what candidates see on a role)', () => {
  const wf = DEFAULT_STAGES
  it('drafts and filled reqs are labeled as such', () => {
    expect(freshness('draft', wf, [])).toBe('Draft')
    expect(freshness('filled', wf, [active(4)])).toBe('Filled')
  })
  it('is Sourcing with no active candidates', () => {
    expect(freshness('live', wf, [])).toBe('Sourcing')
    expect(freshness('live', wf, [active(0)])).toBe('Sourcing')
  })
  it('reflects the furthest active candidate', () => {
    expect(freshness('live', wf, [active(1)])).toBe('Client reviewing')
    expect(freshness('live', wf, [active(1), active(2)])).toBe('Interviewing now')
    expect(freshness('live', wf, [active(2), active(4)])).toBe('Offer out')
  })
  it('ignores closed submissions so a ghost job never looks alive', () => {
    expect(freshness('live', wf, [closed(4), closed(2)])).toBe('Sourcing')
  })
})

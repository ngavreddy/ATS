import { describe, it, expect } from 'vitest'
import { decisionEffect } from '../decision'
import { applyRecommendation } from '../apply-decision'

describe('decisionEffect', () => {
  it('advance moves to the next stage', () => expect(decisionEffect('advance', 1, 5)).toEqual({ stageIndex: 2, touchNote: null }))
  it('advance never goes past the last stage', () => expect(decisionEffect('advance', 4, 5).stageIndex).toBe(4))
  it('another round stays put and creates a task', () => {
    const e = decisionEffect('another_round', 3, 5)
    expect(e.stageIndex).toBe(3)
    expect(e.touchNote).toContain('another conversation')
  })
  it('pass stays put so the recruiter chooses the disposition', () => {
    const e = decisionEffect('pass', 2, 5)
    expect(e.stageIndex).toBe(2)
    expect(e.touchNote).toContain('disposition')
  })
})

function fakeDb() {
  const updates: any[] = []
  return { updates, from: () => ({ update: (p: any) => ({ eq: () => { updates.push(p); return Promise.resolve({}) } }) }) }
}
const wf = [{ name: 'Submitted' }, { name: 'Client review' }, { name: 'Interview 1' }]

describe('applyRecommendation', () => {
  it('advance writes the new stage name and no task', async () => {
    const db = fakeDb()
    await applyRecommendation(db as never, { id: 's', stage_index: 1 }, wf, 'advance')
    expect(db.updates).toEqual([{ stage_index: 2, stage_name: 'Interview 1' }])
  })
  it('pass writes only a task, and leaves the stage alone', async () => {
    const db = fakeDb()
    await applyRecommendation(db as never, { id: 's', stage_index: 1 }, wf, 'pass')
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0]).toHaveProperty('next_touch_note')
    expect(db.updates[0]).not.toHaveProperty('stage_index')
  })
  it('advance at the last stage changes nothing', async () => {
    const db = fakeDb()
    await applyRecommendation(db as never, { id: 's', stage_index: 2 }, wf, 'advance')
    expect(db.updates).toEqual([])
  })
})

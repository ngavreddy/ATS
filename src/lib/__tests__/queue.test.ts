import { describe, it, expect } from 'vitest'
import { queueGroup, queueLabel } from '../queue'

describe('queueLabel', () => {
  it('client feedback shows hours waiting', () => expect(queueLabel('client_feedback', 51.6, 27.6)).toBe('52h waiting'))
  it('stalled shows whole days in stage', () => expect(queueLabel('stalled', 216, 96)).toBe('9d in stage'))
  it('touch shows days overdue, or Due today inside the first day', () => {
    expect(queueLabel('touch', 50, 50)).toBe('2d overdue')
    expect(queueLabel('touch', 5, 5)).toBe('Due today')
    expect(queueLabel('touch', 24, 24)).toBe('1d overdue')
  })
})
describe('queueGroup', () => {
  it('names each group like the mockup', () => {
    expect(queueGroup('client_feedback')).toBe('Client feedback')
    expect(queueGroup('stalled')).toBe('Stalled submission')
    expect(queueGroup('touch')).toBe('Candidate touch')
  })
})

import { describe, it, expect } from 'vitest'
import { many, one, readValues } from '../form-state'

describe('readValues', () => {
  it('reads text fields and repeated checkboxes', () => {
    const fd = new FormData(); fd.append('first_name', 'Priya'); fd.append('work_models', 'hybrid'); fd.append('work_models', 'remote')
    expect(readValues(fd)).toEqual({ first_name: 'Priya', work_models: ['hybrid', 'remote'] })
  })
  it('skips Next.js internals and files', () => {
    const fd = new FormData(); fd.append('$ACTION_ID_abc', 'x'); fd.append('name', 'A'); fd.append('resume', new File(['x'], 'r.pdf'))
    expect(readValues(fd)).toEqual({ name: 'A' })
  })
  it('one and many normalise either shape', () => {
    expect(one(['a', 'b'])).toBe('a'); expect(one('a')).toBe('a'); expect(one(undefined)).toBe('')
    expect(many('a')).toEqual(['a']); expect(many(['a', 'b'])).toEqual(['a', 'b']); expect(many(undefined)).toEqual([])
  })
})

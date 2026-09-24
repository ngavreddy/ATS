import { describe, it, expect } from 'vitest'
import {
  assessmentSummary, biasFlags, parseCriteriaResponse, scorecardSummary,
  validateAssessment, validateCriteria, validateScorecard, type Criterion, type Ratings, type Scores,
} from '../criteria'

const c = (over: Partial<Criterion> = {}): Criterion => ({
  id: crypto.randomUUID(), name: 'Spark at scale', kind: 'must', weight: 3,
  definition: 'Ran production Spark jobs on billions of rows daily', ...over,
})
// The Northwind req from the mockups: 5 must-haves
const northwind: Criterion[] = [
  c({ id: 'spark', name: 'Spark or Databricks at scale' }),
  c({ id: 'migration', name: 'Led a warehouse migration', weight: 2 }),
  c({ id: 'sql', name: 'Python and SQL', weight: 2 }),
  c({ id: 'hybrid', name: 'Hybrid in Chicago', weight: 1, definition: 'Can be onsite up to 3 days a week' }),
  c({ id: 'domain', name: 'Healthcare or logistics data', weight: 1, definition: 'Has worked with claims, EHR, shipment or routing data' }),
]

describe('biasFlags (job-related criteria only)', () => {
  it.each([
    ['Must live in ZIP code 60601', 'ZIP'],
    ['Recent grad who is a digital native', 'age'],
    ['Maximum of 10 years experience', 'age'],
    ['Native English speaker', 'national-origin'],
    ['Strong culture fit', 'subjective'],
    ['Physically fit and clean-cut', 'disability or appearance'],
    ['No childcare conflicts', 'family'],
  ])('flags "%s"', (text, reason) => {
    const flags = biasFlags(text)
    expect(flags.length).toBeGreaterThan(0)
    expect(flags.map((f) => f.reason).join(' ')).toContain(reason)
  })
  it.each([
    'Spark or Databricks at scale',
    'Led a warehouse migration from Teradata to Snowflake',
    'Minimum 5 years of Spark experience',
    'Built a single-page app used by 10,000 people',
    'Reviewed recent releases and shipped weekly',
  ])('does not flag legitimate wording: "%s"', (text) => {
    expect(biasFlags(text)).toEqual([])
  })
})

describe('validateCriteria', () => {
  it('accepts a well-formed set', () => expect(validateCriteria(northwind)).toEqual([]))
  it('needs at least one criterion and at least one must-have', () => {
    expect(validateCriteria([])).toContain('Add at least one criterion.')
    expect(validateCriteria([c({ kind: 'nice' })])).toContain('At least one criterion must be a must-have.')
  })
  it('caps the list at 8 so it stays meaningful', () => {
    const nine = Array.from({ length: 9 }, (_, i) => c({ name: `Skill ${i}` }))
    expect(validateCriteria(nine).join(' ')).toContain('8 criteria or fewer')
  })
  it('requires a name and a definition of good evidence', () => {
    expect(validateCriteria([c({ name: '  ' })]).join(' ')).toContain('needs a name')
    expect(validateCriteria([c({ definition: '' })]).join(' ')).toContain('definition of what strong evidence looks like')
  })
  it('rejects duplicates regardless of case', () => {
    expect(validateCriteria([c({ name: 'SQL' }), c({ name: 'sql' })]).join(' ')).toContain('appears twice')
  })
  it('rejects a bad weight or kind', () => {
    expect(validateCriteria([c({ weight: 5 as never })]).join(' ')).toContain('weight of 1, 2 or 3')
    expect(validateCriteria([c({ kind: 'maybe' as never })]).join(' ')).toContain('must-have or a nice-to-have')
  })
  it('blocks proxy language and tells the recruiter how to fix it', () => {
    const errs = validateCriteria([c({ name: 'Digital native comfortable with Spark' })])
    expect(errs.join(' ').toLowerCase()).toContain('digital native')
    expect(errs.join(' ')).toContain('Reword it')
  })
})

describe('assessment at submission', () => {
  const ratings: Ratings = {
    spark: { status: 'met', evidence: '5 yrs, billions of rows daily' },
    migration: { status: 'met', evidence: 'Teradata to Snowflake, 2024' },
    sql: { status: 'met', evidence: 'Primary languages' },
    hybrid: { status: 'met', evidence: 'Chicago, up to 3 days' },
    domain: { status: 'partial', evidence: 'Retail supply-chain data only' },
  }
  it('reproduces the mockup: "4 of 5 met"', () => {
    const s = assessmentSummary(northwind, ratings)
    expect(s).toMatchObject({ mustTotal: 5, met: 4, partial: 1, notMet: 0, unknown: 0 })
  })
  it('counts an unrated must-have as unknown, never as met', () => {
    expect(assessmentSummary(northwind, {}).unknown).toBe(5)
  })
  it('a complete, evidenced assessment is valid', () => expect(validateAssessment(northwind, ratings)).toEqual([]))
  it('every must-have has to be rated', () => {
    const rest = { ...ratings }
    delete rest.spark
    expect(validateAssessment(northwind, rest)).toEqual(['Rate "Spark or Databricks at scale".'])
  })
  it('"met" and "partial" need evidence, but "not met" and "unknown" do not', () => {
    expect(validateAssessment(northwind, { ...ratings, spark: { status: 'met', evidence: '  ' } }).join(' ')).toContain('Add the evidence')
    expect(validateAssessment(northwind, { ...ratings, spark: { status: 'not_met' } })).toEqual([])
    expect(validateAssessment(northwind, { ...ratings, spark: { status: 'unknown' } })).toEqual([])
  })
  it('nice-to-haves are optional', () => {
    const list = [c({ id: 'a' }), c({ id: 'b', kind: 'nice' })]
    expect(validateAssessment(list, { a: { status: 'met', evidence: 'x' } })).toEqual([])
  })
  it('rejects a made-up status', () => {
    expect(validateAssessment(northwind, { ...ratings, spark: { status: 'great' as never, evidence: 'x' } }).join(' ')).toContain('invalid')
  })
})

describe('scorecard', () => {
  const all = (level: number): Scores => Object.fromEntries(northwind.map((x) => [x.id, { level }]))
  it('requires every criterion rated and a next step', () => {
    expect(validateScorecard(northwind, all(2), 'advance')).toEqual([])
    expect(validateScorecard(northwind, { spark: { level: 2 } }, 'advance').length).toBe(4)
    expect(validateScorecard(northwind, all(2), null)).toContain('Choose what should happen next.')
    expect(validateScorecard(northwind, all(2), 'hire')).toContain('Choose what should happen next.')
  })
  it('rejects levels outside 0 to 3', () => {
    expect(validateScorecard(northwind, { ...all(2), spark: { level: 4 } }, 'advance').join(' ')).toContain('Rate')
    expect(validateScorecard(northwind, { ...all(2), spark: { level: -1 } }, 'advance').join(' ')).toContain('Rate')
    expect(validateScorecard(northwind, { ...all(2), spark: { level: 1.5 } }, 'advance').join(' ')).toContain('Rate')
  })
  it('weighted percentage: all Exceptional is 100, all No evidence is 0, all Strong is 67', () => {
    expect(scorecardSummary(northwind, all(3)).pct).toBe(100)
    expect(scorecardSummary(northwind, all(0)).pct).toBe(0)
    expect(scorecardSummary(northwind, all(2)).pct).toBe(67)
  })
  it('weights matter: strong on the critical criterion beats strong on a minor one', () => {
    const a = { ...all(0), spark: { level: 3 } }      // weight 3
    const b = { ...all(0), hybrid: { level: 3 } }     // weight 1
    expect(scorecardSummary(northwind, a).pct!).toBeGreaterThan(scorecardSummary(northwind, b).pct!)
  })
  it('gives no percentage until every criterion is rated', () => {
    const s = scorecardSummary(northwind, { spark: { level: 3 } })
    expect(s).toMatchObject({ rated: 1, total: 5, complete: false, pct: null })
  })
  it('surfaces a must-have with no evidence even when the average looks fine', () => {
    const s = scorecardSummary(northwind, { ...all(3), migration: { level: 0 } })
    expect(s.pct).toBeGreaterThan(70)
    expect(s.mustGaps).toEqual(['Led a warehouse migration'])
  })
})

describe('parseCriteriaResponse (Claude output)', () => {
  const good = { criteria: [{ name: 'Spark at scale', kind: 'must', weight: 3, definition: 'Ran production jobs on billions of rows' }], open_questions: ['Is on-call expected?'] }
  it('parses plain JSON and assigns unique ids', () => {
    const r = parseCriteriaResponse(JSON.stringify({ criteria: [good.criteria[0], { ...good.criteria[0], name: 'SQL' }], open_questions: [] }))
    expect(r.criteria).toHaveLength(2)
    expect(r.criteria[0].id).not.toBe(r.criteria[1].id)
    expect(r.criteria[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('tolerates code fences and defaults missing open_questions', () => {
    const r = parseCriteriaResponse('```json\n' + JSON.stringify({ criteria: good.criteria }) + '\n```')
    expect(r.criteria).toHaveLength(1)
    expect(r.open_questions).toEqual([])
  })
  it('throws on prose instead of JSON', () => expect(() => parseCriteriaResponse('Sure! Here are your criteria')).toThrow())
  it('throws when the model drifts from the schema', () => {
    expect(() => parseCriteriaResponse(JSON.stringify({ criteria: [{ name: 'x', kind: 'must', weight: 9, definition: 'y' }] }))).toThrow()
    expect(() => parseCriteriaResponse(JSON.stringify({ criteria: [{ name: 'x', kind: 'critical', weight: 2, definition: 'y' }] }))).toThrow()
    expect(() => parseCriteriaResponse(JSON.stringify({ criteria: [] }))).toThrow()
  })
  it('throws on more than 8 criteria rather than silently truncating', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...good.criteria[0], name: `S${i}` }))
    expect(() => parseCriteriaResponse(JSON.stringify({ criteria: many }))).toThrow()
  })
  it('AI output still goes through the proxy lint afterwards', () => {
    const r = parseCriteriaResponse(JSON.stringify({ criteria: [{ name: 'Culture fit', kind: 'must', weight: 2, definition: 'Fits our team' }] }))
    expect(validateCriteria(r.criteria).join(' ').toLowerCase()).toContain('culture fit')
  })
})

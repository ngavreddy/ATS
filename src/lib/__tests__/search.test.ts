import { describe, it, expect } from 'vitest'
import { parseBoolean, parseMoney, readSearch } from '../search'

const q = (s: string) => parseBoolean(s)

describe('parseBoolean: building blocks', () => {
  it('blank means no keyword filter', () => {
    expect(q('')).toEqual({ tsquery: null, error: null })
    expect(q('   ')).toEqual({ tsquery: null, error: null })
    expect(parseBoolean(undefined)).toEqual({ tsquery: null, error: null })
  })
  it('a single word', () => expect(q('python').tsquery).toBe("'python'"))
  it('words are lower-cased', () => expect(q('Python').tsquery).toBe("'python'"))
  it('two words in a row mean AND', () => expect(q('python sql').tsquery).toBe("('python' & 'sql')"))
  it('AND, OR and NOT work in upper and lower case', () => {
    expect(q('python AND sql').tsquery).toBe("('python' & 'sql')")
    expect(q('python and sql').tsquery).toBe("('python' & 'sql')")
    expect(q('python OR sql').tsquery).toBe("('python' | 'sql')")
    expect(q('python or sql').tsquery).toBe("('python' | 'sql')")
    expect(q('python NOT intern').tsquery).toBe("('python' & !'intern')")
  })
  it('a leading minus means NOT', () => expect(q('python -intern').tsquery).toBe("('python' & !'intern')"))
  it('a quoted phrase must appear in order', () => expect(q('"data engineer"').tsquery).toBe("('data' <-> 'engineer')"))
  it('a missing closing quote still works', () => expect(q('"data engineer').tsquery).toBe("('data' <-> 'engineer')"))
  it('an asterisk means "starts with"', () => expect(q('engineer*').tsquery).toBe("'engineer':*"))
  it('NOT a phrase negates the whole phrase, not just its first word', () => {
    expect(q('NOT "data engineer"').tsquery).toBe("!('data' <-> 'engineer')")
    expect(q('python -"data engineer"').tsquery).toBe("('python' & !('data' <-> 'engineer'))")
  })
})

describe('parseBoolean: precedence and brackets', () => {
  it('AND binds tighter than OR', () => expect(q('python sql OR java').tsquery).toBe("(('python' & 'sql') | 'java')"))
  it('brackets override it', () => expect(q('python (sql OR java)').tsquery).toBe("('python' & ('sql' | 'java'))"))
  it('the example a recruiter would actually type', () =>
    expect(q('"data engineer" AND (spark OR databricks) NOT intern').tsquery)
      .toBe("((('data' <-> 'engineer') & ('spark' | 'databricks')) & !'intern')"))
  it('NOT applies to a whole bracket', () => expect(q('NOT (a OR b)').tsquery).toBe("!('a' | 'b')"))
  it('nested brackets', () => expect(q('((a OR b) AND (c OR d))').tsquery).toBe("(('a' | 'b') & ('c' | 'd'))"))
})

describe('parseBoolean: punctuation in real skills', () => {
  it('Node.js becomes node then js, matching how the database indexes it', () => expect(q('Node.js').tsquery).toBe("('node' <-> 'js')"))
  it('CI/CD', () => expect(q('CI/CD').tsquery).toBe("('ci' <-> 'cd')"))
  it('C++ and C# reduce to c', () => { expect(q('C++').tsquery).toBe("'c'"); expect(q('C#').tsquery).toBe("'c'") })
  it('hyphenated words', () => expect(q('full-time').tsquery).toBe("('full' <-> 'time')"))
  it('accented letters are kept', () => expect(q('José').tsquery).toBe("'josé'"))
})

describe('parseBoolean: mistakes get a plain-English message, never a crash', () => {
  it.each([
    ['(python', 'not closed'],
    ['python)', 'without a matching'],
    ['()', 'nothing inside'],
    ['python AND', 'need a word'],
    ['AND python', 'need a word'],
    ['python AND OR sql', 'need a word'],
    ['NOT', 'at least one word'],
    ['---', 'at least one word'],
  ])('%s', (input, fragment) => {
    const r = q(input)
    expect(r.tsquery).toBeNull()
    expect(r.error).toContain(fragment)
  })
  it('a very long query is refused', () => expect(q('a '.repeat(200)).error).toContain('300 characters'))
  it('too many terms is refused', () => expect(q(Array.from({ length: 26 }, (_, i) => `w${i}`).join(' ')).error).toContain('25 search words'))
})

describe('parseBoolean: nothing a user types can change the query structure', () => {
  const hostile = [
    "'; drop table candidates; --", "a:* & b | !c <-> d", "x') OR ('1'='1", '\\\\ \'\' "" \0', 'a & (b | c) ! d :* <-> e',
    "python' | 'evil", '<-> <-> <->',
  ]
  it.each(hostile)('%j', (input) => {
    const r = q(input)
    if (r.tsquery === null) return                         // a clear error is fine
    const words = r.tsquery.match(/'[^']*'/g) ?? []
    expect(words.length).toBeGreaterThan(0)
    for (const w of words) expect(w).toMatch(/^'[\p{L}\p{N}]+'$/u)   // every word is quoted letters and digits only
    expect(r.tsquery.replace(/'[^']*'/g, 'W')).toMatch(/^[W\s()&|!<>\-:*]*$/)   // everything else is our own operators
  })
})

describe('parseMoney', () => {
  it.each([['185000', 185000], ['185,000', 185000], ['$185,000', 185000], ['185k', 185000], ['185K', 185000], ['1.5k', 1500], ['$1.2m', 1200000], [' 90 000 ', 90000]])(
    '%s -> %d', (input, out) => expect(parseMoney(input)).toBe(out))
  it.each(['', 'abc', '12x', '-5', '1e6', '99999999999', null, undefined])('%j -> null', (input) => expect(parseMoney(input as string)).toBeNull())
})

describe('readSearch (the address bar)', () => {
  it('an empty search has no filters and no errors', () => {
    const r = readSearch({})
    expect(r.errors).toEqual([])
    expect(r.filtering).toBe(false)
    expect(r.args).toMatchObject({ q: null, p_city: null, p_state: null, p_min: null, p_max: null, p_models: null, p_source: null, p_relocate: null, p_has_resume: null })
  })
  it('maps every filter to a database argument', () => {
    const r = readSearch({ q: 'spark', city: 'Chicago', state: 'il', min: '150k', max: '200,000', wm: ['hybrid', 'remote'], source: 'referral', relocate: '1', resume: '1' })
    expect(r.errors).toEqual([])
    expect(r.filtering).toBe(true)
    expect(r.args).toEqual({ q: "'spark'", p_city: 'Chicago', p_state: 'IL', p_min: 150000, p_max: 200000, p_models: ['hybrid', 'remote'], p_source: 'referral', p_relocate: true, p_has_resume: true })
  })
  it('a single work model arrives as a string', () => expect(readSearch({ wm: 'onsite' }).args.p_models).toEqual(['onsite']))
  it('ignores work models and sources that are not on the list', () => {
    const r = readSearch({ wm: ['teleport', 'remote'], source: 'stranger' })
    expect(r.args.p_models).toEqual(['remote'])
    expect(r.args.p_source).toBeNull()
  })
  it('a minimum above the maximum is an error', () => expect(readSearch({ min: '200k', max: '100k' }).errors).toContain('The salary minimum is higher than the maximum.'))
  it('unreadable salaries are errors', () => expect(readSearch({ min: 'lots', max: 'more' }).errors).toHaveLength(2))
  it('SQL wildcards in the city are removed', () => expect(readSearch({ city: '%_Chi\\' }).args.p_city).toBe('Chi'))
  it('a keyword error is passed on', () => expect(readSearch({ q: '(python' }).errors[0]).toContain('not closed'))
  it('only takes the first value when a parameter repeats', () => expect(readSearch({ q: ['python', 'java'] }).raw.q).toBe('python'))
})

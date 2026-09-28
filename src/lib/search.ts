// Boolean candidate search. People type:  "data engineer" AND (spark OR databricks) NOT intern
// We turn that into a safe Postgres tsquery. Every word is reduced to letters and digits and quoted,
// so nothing a user types can change the structure of the query.

export type ParsedSearch = { tsquery: string | null; error: string | null }

type Tok =
  | { t: 'lp' } | { t: 'rp' } | { t: 'and' } | { t: 'or' } | { t: 'not' }
  | { t: 'term'; words: string[]; prefix: boolean }
type Node =
  | { op: 'term'; words: string[]; prefix: boolean }
  | { op: 'and' | 'or'; l: Node; r: Node }
  | { op: 'not'; x: Node }

export const MAX_QUERY_LENGTH = 300
const MAX_TERMS = 25
const wordsOf = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => w.slice(0, 50))

class SearchError extends Error {}

function tokenize(input: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '(') { out.push({ t: 'lp' }); i++; continue }
    if (ch === ')') { out.push({ t: 'rp' }); i++; continue }
    if (ch === '"') {
      const end = input.indexOf('"', i + 1)
      const raw = input.slice(i + 1, end === -1 ? input.length : end)   // a missing closing quote runs to the end
      const words = wordsOf(raw)
      if (words.length) out.push({ t: 'term', words, prefix: false })
      i = end === -1 ? input.length : end + 1
      continue
    }
    if (ch === '-' && i + 1 < input.length && !/\s/.test(input[i + 1])) { out.push({ t: 'not' }); i++; continue }  // -intern
    let j = i
    while (j < input.length && !/[\s()"]/.test(input[j])) j++
    const raw = input.slice(i, j)
    i = j
    const lower = raw.toLowerCase()
    if (lower === 'and' || raw === '&&') out.push({ t: 'and' })
    else if (lower === 'or' || raw === '||') out.push({ t: 'or' })
    else if (lower === 'not') out.push({ t: 'not' })
    else {
      const words = wordsOf(raw)
      if (words.length) out.push({ t: 'term', words, prefix: raw.endsWith('*') })
    }
  }
  return out
}

function parse(tokens: Tok[]): Node {
  let pos = 0
  const peek = () => tokens[pos]
  const startsOperand = (t?: Tok) => !!t && (t.t === 'term' || t.t === 'not' || t.t === 'lp')

  function parseOr(): Node {
    let left = parseAnd()
    while (peek()?.t === 'or') { pos++; left = { op: 'or', l: left, r: parseAnd() } }
    return left
  }
  function parseAnd(): Node {
    let left = parseUnary()
    for (;;) {
      if (peek()?.t === 'and') { pos++; left = { op: 'and', l: left, r: parseUnary() } }
      else if (startsOperand(peek())) left = { op: 'and', l: left, r: parseUnary() }   // two words in a row mean AND
      else return left
    }
  }
  function parseUnary(): Node {
    if (peek()?.t === 'not') { pos++; return { op: 'not', x: parseUnary() } }
    return parsePrimary()
  }
  function parsePrimary(): Node {
    const t = peek()
    if (!t) throw new SearchError('AND, OR and NOT need a word on each side.')
    if (t.t === 'lp') {
      pos++
      if (peek()?.t === 'rp') throw new SearchError('There is nothing inside the brackets.')
      const inner = parseOr()
      if (peek()?.t !== 'rp') throw new SearchError('A bracket is not closed. Add a ) at the end.')
      pos++
      return inner
    }
    if (t.t === 'term') { pos++; return { op: 'term', words: t.words, prefix: t.prefix } }
    if (t.t === 'rp') throw new SearchError('There is a ) without a matching (.')
    throw new SearchError('AND, OR and NOT need a word on each side.')
  }

  const tree = parseOr()
  if (pos < tokens.length) {
    if (tokens[pos].t === 'rp') throw new SearchError('There is a ) without a matching (.')
    throw new SearchError('Check the query. Something is out of place.')
  }
  return tree
}

function render(n: Node): string {
  if (n.op === 'term') {
    const phrase = n.words.map((w, i) => `'${w}'${n.prefix && i === n.words.length - 1 ? ':*' : ''}`).join(' <-> ')
    // In Postgres NOT binds tighter than "followed by", so a phrase must be bracketed or NOT "a b" would mean (NOT a) b
    return n.words.length > 1 ? `(${phrase})` : phrase
  }
  if (n.op === 'not') return `!${render(n.x)}`
  return `(${render(n.l)} ${n.op === 'and' ? '&' : '|'} ${render(n.r)})`
}

const countTerms = (n: Node): number => (n.op === 'term' ? 1 : n.op === 'not' ? countTerms(n.x) : countTerms(n.l) + countTerms(n.r))

export function parseBoolean(input: string | null | undefined): ParsedSearch {
  const text = (input ?? '').trim()
  if (!text) return { tsquery: null, error: null }
  if (text.length > MAX_QUERY_LENGTH) return { tsquery: null, error: `Keep the search under ${MAX_QUERY_LENGTH} characters.` }
  try {
    const tokens = tokenize(text)
    if (!tokens.some((t) => t.t === 'term') && !tokens.some((t) => t.t === 'lp' || t.t === 'rp'))
      return { tsquery: null, error: 'Type at least one word to search for.' }
    const tree = parse(tokens)
    if (countTerms(tree) > MAX_TERMS) return { tsquery: null, error: `Use ${MAX_TERMS} search words or fewer.` }
    return { tsquery: render(tree), error: null }
  } catch (e) {
    if (e instanceof SearchError) return { tsquery: null, error: e.message }
    throw e
  }
}

// ── Filters ──────────────────────────────────────────────
export const SOURCE_LABEL: Record<string, string> = { sourced: 'Sourced', referral: 'Referral', applicant: 'Applicant' }

// "185k", "185,000", "$185000" and "1.2m" all work
export function parseMoney(s: string | null | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*([km])?$/i.exec((s ?? '').replace(/[$,\s]/g, ''))
  if (!m) return null
  const n = Math.round(parseFloat(m[1]) * (m[2]?.toLowerCase() === 'k' ? 1e3 : m[2]?.toLowerCase() === 'm' ? 1e6 : 1))
  return n <= 10_000_000 ? n : null
}

export type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

// Reads the address bar. Returns the raw values (to refill the form), the arguments for the database function, and any error.
export function readSearch(sp: SearchParams) {
  const raw = {
    q: first(sp.q).trim(), city: first(sp.city).trim(), state: first(sp.state).trim().toUpperCase(),
    min: first(sp.min).trim(), max: first(sp.max).trim(),
    wm: (Array.isArray(sp.wm) ? sp.wm : sp.wm ? [sp.wm] : []).filter((m) => ['onsite', 'hybrid', 'remote'].includes(m)),
    source: Object.keys(SOURCE_LABEL).includes(first(sp.source)) ? first(sp.source) : '',
    relocate: first(sp.relocate) === '1', resume: first(sp.resume) === '1',
  }
  const errors: string[] = []
  const kw = parseBoolean(raw.q)
  if (kw.error) errors.push(kw.error)
  const min = raw.min ? parseMoney(raw.min) : null
  const max = raw.max ? parseMoney(raw.max) : null
  if (raw.min && min === null) errors.push('The salary minimum should look like 150000 or 150k.')
  if (raw.max && max === null) errors.push('The salary maximum should look like 200000 or 200k.')
  if (min !== null && max !== null && min > max) errors.push('The salary minimum is higher than the maximum.')
  const args = {
    q: kw.tsquery, p_city: raw.city.replace(/[%_\\]/g, '') || null, p_state: raw.state.length === 2 ? raw.state : null,
    p_min: min, p_max: max, p_models: raw.wm.length ? raw.wm : null, p_source: raw.source || null,
    p_relocate: raw.relocate ? true : null, p_has_resume: raw.resume ? true : null,
  }
  const filtering = Object.values(raw).some((v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== false))
  return { raw, args, errors, filtering }
}

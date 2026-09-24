import { z } from 'zod'

export type Criterion = { id: string; name: string; kind: 'must' | 'nice'; weight: 1 | 2 | 3; definition: string }

export const MAX_CRITERIA = 8

// Assessment (recruiter, at submission): is there evidence the candidate meets it?
export type Status = 'met' | 'partial' | 'not_met' | 'unknown'
export const STATUSES: Status[] = ['met', 'partial', 'not_met', 'unknown']
export const STATUS_LABEL: Record<Status, string> = { met: 'Met', partial: 'Partial', not_met: 'Not met', unknown: 'Unknown' }
export type Ratings = Record<string, { status: Status; evidence?: string }>

// Scorecard (hiring manager, after interviews): how strong was the evidence?
export const LEVELS = ['No evidence', 'Some', 'Strong', 'Exceptional'] as const
export type Scores = Record<string, { level: number; note?: string }>

// ── Criteria quality and compliance ──────────────────────
// A lint, not a legal determination. It flags wording that commonly acts as a proxy for a protected
// class (Illinois HB 3773 prohibits discriminatory effect, and ZIP codes as a proxy) so a person rewrites it.
const PROXIES: [RegExp, string][] = [
  [/\b(zip|postal)\s*codes?\b/i, 'ZIP codes can act as a proxy for protected classes'],
  [/\b(digital natives?|young|youthful|recent (college )?grad(uate)?s?|fresh out of)\b/i, 'this can act as an age proxy'],
  [/\b(no more than|at most|max(imum)?( of)?|under|up to) \d+\+? years\b/i, 'an experience cap can act as an age proxy'],
  [/\bnative (english )?speakers?\b/i, 'this can act as a national-origin proxy'],
  [/\b(culture fit|cultural fit)\b/i, 'this is subjective and a common source of bias'],
  [/\b(able[- ]bodied|physically fit|clean[- ]cut)\b/i, 'this can act as a disability or appearance proxy'],
  [/\b(marital status|married|single (mother|father|parent)s?|childcare|pregnan\w*)\b/i, 'this can act as a family-status proxy'],
]

export function biasFlags(text: string): { term: string; reason: string }[] {
  const out: { term: string; reason: string }[] = []
  for (const [rx, reason] of PROXIES) {
    const m = rx.exec(text)
    if (m) out.push({ term: m[0], reason })
  }
  return out
}

export function validateCriteria(list: Criterion[]): string[] {
  const errs: string[] = []
  if (list.length < 1) errs.push('Add at least one criterion.')
  if (list.length > MAX_CRITERIA) errs.push(`Keep it to ${MAX_CRITERIA} criteria or fewer. Long lists dilute what matters.`)
  if (list.length && !list.some((c) => c.kind === 'must')) errs.push('At least one criterion must be a must-have.')
  const seen = new Set<string>()
  list.forEach((c, i) => {
    const name = (c.name ?? '').trim()
    const label = name || `Criterion ${i + 1}`
    if (!name) errs.push(`Criterion ${i + 1} needs a name.`)
    if (name.length > 140) errs.push(`"${label}" is too long. Keep names short and specific.`)
    if (!(c.definition ?? '').trim()) errs.push(`"${label}" needs a definition of what strong evidence looks like.`)
    if (![1, 2, 3].includes(c.weight)) errs.push(`"${label}" needs a weight of 1, 2 or 3.`)
    if (!['must', 'nice'].includes(c.kind)) errs.push(`"${label}" must be a must-have or a nice-to-have.`)
    const key = name.toLowerCase()
    if (key) {
      if (seen.has(key)) errs.push(`"${label}" appears twice.`)
      seen.add(key)
    }
    for (const f of biasFlags(`${c.name} ${c.definition}`))
      errs.push(`"${label}" contains "${f.term}": ${f.reason}. Reword it to describe the skill or outcome instead.`)
  })
  return errs
}

// ── AI output parsing ────────────────────────────────────
export const AiCriteria = z.object({
  criteria: z.array(z.object({
    name: z.string().min(1),
    kind: z.enum(['must', 'nice']),
    weight: z.number().int().min(1).max(3),
    definition: z.string().min(1),
  })).min(1).max(MAX_CRITERIA),
  open_questions: z.array(z.string()).default([]),
})

export function parseCriteriaResponse(text: string) {
  const json = JSON.parse(text.replace(/```json|```/g, '').trim())
  const parsed = AiCriteria.parse(json)
  return {
    criteria: parsed.criteria.map((c) => ({ ...c, id: crypto.randomUUID() })) as Criterion[],
    open_questions: parsed.open_questions,
  }
}

// ── Recruiter assessment at submission ───────────────────
export function validateAssessment(criteria: Criterion[], ratings: Ratings): string[] {
  const errs: string[] = []
  for (const c of criteria) {
    const r = ratings[c.id]
    if (c.kind === 'must' && !r?.status) errs.push(`Rate "${c.name}".`)
    else if (r?.status && !STATUSES.includes(r.status)) errs.push(`"${c.name}" has an invalid rating.`)
    else if ((r?.status === 'met' || r?.status === 'partial') && !(r.evidence ?? '').trim())
      errs.push(`Add the evidence behind "${c.name}". A rating of ${STATUS_LABEL[r.status].toLowerCase()} needs a reason.`)
  }
  return errs
}

// "4 of 5 met" on the client's submitted view
export function assessmentSummary(criteria: Criterion[], ratings: Ratings) {
  const musts = criteria.filter((c) => c.kind === 'must')
  const count = (s: Status) => musts.filter((c) => (ratings[c.id]?.status ?? 'unknown') === s).length
  return { mustTotal: musts.length, met: count('met'), partial: count('partial'), notMet: count('not_met'), unknown: count('unknown') }
}

// ── Hiring manager scorecard ─────────────────────────────
export function validateScorecard(criteria: Criterion[], scores: Scores, recommendation: string | null): string[] {
  const errs: string[] = []
  for (const c of criteria) {
    const l = scores[c.id]?.level
    if (l === undefined || !Number.isInteger(l) || l < 0 || l > 3) errs.push(`Rate "${c.name}".`)
  }
  if (!['advance', 'another_round', 'pass'].includes(recommendation ?? '')) errs.push('Choose what should happen next.')
  return errs
}

// A weighted percentage for sorting and at-a-glance reading. The per-criterion ratings are the real record.
export function scorecardSummary(criteria: Criterion[], scores: Scores) {
  const rated = criteria.filter((c) => Number.isInteger(scores[c.id]?.level)).length
  const complete = criteria.length > 0 && rated === criteria.length
  const totalWeight = criteria.reduce((n, c) => n + c.weight, 0)
  const earned = criteria.reduce((n, c) => n + (scores[c.id]?.level ?? 0) * c.weight, 0)
  return {
    rated,
    total: criteria.length,
    complete,
    pct: complete ? Math.round((100 * earned) / (3 * totalWeight)) : null,
    // A must-have with no evidence is a red flag no average should hide
    mustGaps: criteria.filter((c) => c.kind === 'must' && scores[c.id]?.level === 0).map((c) => c.name),
  }
}

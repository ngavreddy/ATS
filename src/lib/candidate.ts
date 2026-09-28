import { normalizeState } from './us-states'
import { composeHeadline } from './names'
import { parseMoney } from './search'
import type { Prefs } from './filters'
import type { FormValues } from './form-state'
import { many, one } from './form-state'

export const SOURCES: [string, string][] = [['sourced', 'Sourced'], ['referral', 'Referral'], ['applicant', 'Applicant']]
export const NOTICE_PERIODS: [string, string][] = [
  ['immediate', 'Immediately'], ['2w', '2 weeks'], ['3-4w', '3 to 4 weeks'], ['1-2m', '1 to 2 months'], ['3m+', '3 months or more'],
]
export const WORK_AUTH: [string, string][] = [
  ['no_sponsorship_needed', 'Authorized to work in the US, no sponsorship needed'],
  ['needs_sponsorship', 'Will need sponsorship'], ['unsure', 'Not sure yet'],
]
export const WORK_MODELS = ['onsite', 'hybrid', 'remote'] as const

export function parseList(s: string | null | undefined, max = 30): string[] {
  const seen = new Set<string>(); const out: string[] = []
  for (const part of (s ?? '').split(/[,;\n]/)) {
    const v = part.trim().slice(0, 80)
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v) }
  }
  return out.slice(0, max)
}

export function normalizeEmail(s: string | null | undefined): string | null {
  const v = (s ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null
}

// One format, so the same number is recognised as a duplicate however it was typed
export function formatPhone(s: string | null | undefined): string | null {
  const raw = (s ?? '').trim()
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : raw
}

export function normalizeUrl(s: string): string | null {
  const v = s.trim()
  if (!v) return null
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).toString() } catch { return null }
}

export type CandidateRow = {
  first_name: string; last_name: string; preferred_name: string | null; email: string | null; phone: string | null; linkedin_url: string | null
  address_line: string | null; city: string; state: string; postal_code: string | null
  current_title: string | null; current_employer: string | null; years_experience: number | null; headline: string | null
  skills: string[]; target_titles: string[]; dealbreakers: string[]
  comp_floor: number | null; work_models: string[]; willing_to_relocate: boolean
  notice_period: string | null; work_authorization: string | null; source: string | null; referred_by: string | null
}

export function parseCandidate(v: FormValues): { data: CandidateRow | null; errors: string[] } {
  const errors: string[] = []
  const t = (k: string) => one(v[k]).trim()
  const orNull = (s: string) => s || null

  const first = t('first_name'), last = t('last_name'), city = t('city')
  if (!first) errors.push('First name is required.')
  if (!last) errors.push('Last name is required.')
  if (!city) errors.push('City is required.')
  const state = normalizeState(t('state'))
  if (!t('state')) errors.push('State is required.')
  else if (!state) errors.push('Choose a US state.')

  const email = normalizeEmail(t('email'))
  if (t('email') && !email) errors.push("That email address doesn't look right.")
  const phone = formatPhone(t('phone'))
  if (!email && !phone && !t('email')) errors.push('Add an email or a phone number so you can reach them.')

  let linkedin: string | null = null
  if (t('linkedin_url')) { linkedin = normalizeUrl(t('linkedin_url')); if (!linkedin) errors.push("That LinkedIn link doesn't look right.") }

  const zip = t('postal_code')
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) errors.push('ZIP code should be 5 digits.')

  let years: number | null = null
  if (t('years_experience')) {
    const n = Number(t('years_experience'))
    if (!Number.isInteger(n) || n < 0 || n > 60) errors.push('Years of experience should be a whole number from 0 to 60.')
    else years = n
  }
  let floor: number | null = null
  if (t('comp_floor')) { floor = parseMoney(t('comp_floor')); if (floor === null) errors.push('Minimum base salary should look like 150000 or 150k.') }

  const source = t('source')
  if (source && !SOURCES.some(([k]) => k === source)) errors.push('Choose Sourced, Referral or Applicant.')
  const notice = t('notice_period')
  if (notice && !NOTICE_PERIODS.some(([k]) => k === notice)) errors.push('Choose a notice period from the list.')
  const auth = t('work_authorization')
  if (auth && !WORK_AUTH.some(([k]) => k === auth)) errors.push('Choose a work authorization from the list.')

  if (errors.length || !state) return { data: null, errors }
  const title = t('current_title'), employer = t('current_employer')
  return {
    errors,
    data: {
      first_name: first, last_name: last, preferred_name: orNull(t('preferred_name')), email, phone, linkedin_url: linkedin,
      address_line: orNull(t('address_line')), city, state, postal_code: orNull(zip),
      current_title: orNull(title), current_employer: orNull(employer), years_experience: years,
      headline: composeHeadline({ title, employer, years }),
      skills: parseList(t('skills')), target_titles: parseList(t('target_titles')), dealbreakers: parseList(t('dealbreakers')),
      comp_floor: floor, work_models: many(v.work_models).filter((m) => (WORK_MODELS as readonly string[]).includes(m)),
      willing_to_relocate: ['on', '1', 'true'].includes(t('willing_to_relocate')),
      notice_period: orNull(notice), work_authorization: orNull(auth),
      source: orNull(source), referred_by: source === 'referral' ? orNull(t('referred_by')) : null,
    },
  }
}

// The hard filters used when submitting to a req. Older candidates kept them in a json column.
export function prefsOf(c: { comp_floor?: number | null; work_models?: string[] | null; dealbreakers?: string[] | null; prefs?: Prefs | null }): Prefs {
  return {
    comp_floor: c.comp_floor ?? c.prefs?.comp_floor,
    work_models: c.work_models?.length ? c.work_models : c.prefs?.work_models,
    dealbreakers: c.dealbreakers?.length ? c.dealbreakers : c.prefs?.dealbreakers,
  }
}

import { CLIENT_STATUS, CONTACT_ROLES } from './contacts'
import { formatPhone, normalizeEmail, normalizeUrl } from './candidate'
import { normalizeState } from './us-states'
import { one, type FormValues } from './form-state'

const has = (list: [string, string][], v: string) => list.some(([k]) => k === v)

export type ClientRow = { name: string; status: string; industry: string | null; website: string | null; city: string | null; state: string | null }

export function parseClientForm(v: FormValues): { data: ClientRow | null; errors: string[] } {
  const errors: string[] = []
  const t = (k: string) => one(v[k]).trim()
  if (!t('name')) errors.push('Client name is required.')
  const status = t('status') || 'active'
  if (!has(CLIENT_STATUS, status)) errors.push('Choose Prospect, Active or Inactive.')
  let website: string | null = null
  if (t('website')) { website = normalizeUrl(t('website')); if (!website) errors.push("That website address doesn't look right.") }
  let state: string | null = null
  if (t('state')) { state = normalizeState(t('state')); if (!state) errors.push('Choose a US state.') }
  if (errors.length) return { data: null, errors }
  return { errors, data: { name: t('name').slice(0, 120), status, industry: t('industry') || null, website, city: t('city') || null, state } }
}

export type ContactRow = { name: string; email: string | null; phone: string | null; title: string | null; role: string; is_primary: boolean; notes: string | null }

// prefix lets the same rules read "c_name" on the new-client form and "name" on the contact form
export function parseContactForm(v: FormValues, prefix = ''): { data: ContactRow | null; errors: string[] } {
  const errors: string[] = []
  const t = (k: string) => one(v[prefix + k]).trim()
  const role = t('role') || 'hiring_manager'
  if (!t('name')) errors.push('Contact name is required.')
  if (!has(CONTACT_ROLES, role)) errors.push('Choose a role from the list.')
  const email = normalizeEmail(t('email'))
  if (t('email') && !email) errors.push("That email address doesn't look right.")
  if (role === 'hiring_manager' && !email) errors.push('A hiring manager needs an email address, because feedback links are sent there.')
  if (errors.length) return { data: null, errors }
  return {
    errors,
    data: {
      name: t('name').slice(0, 120), email, phone: formatPhone(t('phone')), title: t('title') || null, role,
      is_primary: ['on', '1', 'true'].includes(t('primary')), notes: t('notes') || null,
    },
  }
}

export type ContractRow = { fee: number; guarantee: number; terms: number; noncirc: number; renewal: string | null }

// A blank fee means "no contract yet" (a prospect), which is fine and returns no data and no errors
export function parseContractForm(v: FormValues): { data: ContractRow | null; errors: string[] } {
  const t = (k: string) => one(v[k]).trim()
  if (!t('fee_pct')) return { data: null, errors: [] }
  const errors: string[] = []
  const num = (k: string, label: string, dflt: number, min: number, max: number, whole = true) => {
    if (!t(k)) return dflt
    const n = Number(t(k))
    if (!Number.isFinite(n) || n < min || n > max || (whole && !Number.isInteger(n))) { errors.push(`${label} should be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}.`); return dflt }
    return n
  }
  const fee = num('fee_pct', 'Fee %', 20, 0.5, 100, false)
  const guarantee = num('guarantee_days', 'Guarantee days', 90, 0, 365)
  const terms = num('terms', 'Net terms', 30, 0, 180)
  const noncirc = num('noncirc', 'Non-circumvention months', 12, 0, 60)
  let renewal: string | null = null
  if (t('renewal')) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t('renewal')) || Number.isNaN(Date.parse(t('renewal')))) errors.push('Renewal date should be a real date.')
    else renewal = t('renewal')
  }
  return errors.length ? { data: null, errors } : { errors, data: { fee, guarantee, terms, noncirc, renewal } }
}

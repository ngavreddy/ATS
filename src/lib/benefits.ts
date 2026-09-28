// Benefits are chosen from a list, not typed. The wording that appears on the posting is generated from the choices,
// so the same benefit is always described the same way. Anything unusual goes in "additional benefits".

export type Benefits = {
  health?: true; dental?: true; vision?: true; life?: true; disability?: true
  retirement?: true; retirement_match_pct?: number; hsa_fsa?: true
  pto?: { type: 'unlimited' } | { type: 'days'; days: number }
  holidays?: number
  parental_leave?: true; tuition?: true; wellness?: true; commuter?: true; equity?: true
}

export const BENEFIT_CHECKBOXES: { key: keyof Benefits; label: string; group: string }[] = [
  { key: 'health', label: 'Medical', group: 'Insurance' },
  { key: 'dental', label: 'Dental', group: 'Insurance' },
  { key: 'vision', label: 'Vision', group: 'Insurance' },
  { key: 'life', label: 'Life insurance', group: 'Insurance' },
  { key: 'disability', label: 'Disability insurance', group: 'Insurance' },
  { key: 'hsa_fsa', label: 'HSA / FSA', group: 'Insurance' },
  { key: 'retirement', label: '401(k) / retirement plan', group: 'Money' },
  { key: 'equity', label: 'Equity', group: 'Money' },
  { key: 'parental_leave', label: 'Paid parental leave', group: 'Time and family' },
  { key: 'tuition', label: 'Tuition assistance', group: 'Growth and wellbeing' },
  { key: 'wellness', label: 'Wellness program', group: 'Growth and wellbeing' },
  { key: 'commuter', label: 'Commuter benefits', group: 'Growth and wellbeing' },
]

const TRUE_KEYS = ['health', 'dental', 'vision', 'life', 'disability', 'retirement', 'hsa_fsa', 'parental_leave', 'tuition', 'wellness', 'commuter', 'equity'] as const

// Cleans whatever the browser sent. Unknown keys are dropped, numbers are range-checked.
export function normalizeBenefits(input: unknown): { benefits: Benefits; errors: string[] } {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const b: Benefits = {}
  const errors: string[] = []
  for (const k of TRUE_KEYS) if (src[k] === true) (b as Record<string, unknown>)[k] = true

  if (b.retirement && src.retirement_match_pct !== undefined && src.retirement_match_pct !== null && src.retirement_match_pct !== '') {
    const n = Number(src.retirement_match_pct)
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.push('The 401(k) match should be a percentage between 0 and 100.')
    else if (n > 0) b.retirement_match_pct = Math.round(n * 10) / 10
  }
  const pto = src.pto as { type?: string; days?: unknown } | null | undefined
  if (pto?.type === 'unlimited') b.pto = { type: 'unlimited' }
  else if (pto?.type === 'days') {
    const d = Number(pto.days)
    if (!Number.isInteger(d) || d < 1 || d > 365) errors.push('Enter the number of PTO days, between 1 and 365.')
    else b.pto = { type: 'days', days: d }
  }
  if (src.holidays !== undefined && src.holidays !== null && src.holidays !== '') {
    const h = Number(src.holidays)
    if (!Number.isInteger(h) || h < 0 || h > 30) errors.push('Paid holidays should be a whole number between 0 and 30.')
    else if (h > 0) b.holidays = h
  }
  return { benefits: b, errors }
}

const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export function benefitsSummary(b: Benefits, other?: string | null): string {
  const parts: string[] = []
  const med = [b.health && 'medical', b.dental && 'dental', b.vision && 'vision'].filter(Boolean) as string[]
  if (med.length) { const s = joinAnd(med); parts.push(s[0].toUpperCase() + s.slice(1)) }
  if (b.life) parts.push('Life insurance')
  if (b.disability) parts.push('Disability insurance')
  if (b.hsa_fsa) parts.push('HSA/FSA')
  if (b.retirement) parts.push(b.retirement_match_pct ? `401(k) with ${b.retirement_match_pct}% match` : '401(k)')
  if (b.equity) parts.push('Equity')
  if (b.pto?.type === 'unlimited') parts.push('Unlimited PTO')
  else if (b.pto?.type === 'days') parts.push(`${b.pto.days} days PTO`)
  if (b.holidays) parts.push(`${b.holidays} paid holidays`)
  if (b.parental_leave) parts.push('Paid parental leave')
  if (b.tuition) parts.push('Tuition assistance')
  if (b.wellness) parts.push('Wellness program')
  if (b.commuter) parts.push('Commuter benefits')
  const extra = (other ?? '').trim()
  if (extra) parts.push(`Also: ${extra}`)
  return parts.join('; ')
}

export const hasAnyBenefit = (b: Benefits, other?: string | null) => Object.keys(b).length > 0 || !!(other ?? '').trim()

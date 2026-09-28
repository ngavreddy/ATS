import { benefitsSummary, hasAnyBenefit, normalizeBenefits, type Benefits } from './benefits'
import { parseMoney } from './search'
import { one, type FormValues } from './form-state'

export const WORK_MODEL_OPTIONS: [string, string][] = [['onsite', 'Onsite'], ['hybrid', 'Hybrid'], ['remote', 'Remote']]
export const PLACEMENT_TYPES: [string, string][] = [['FTE', 'Full-time'], ['contract', 'Contract'], ['C2H', 'Contract-to-hire']]

export type ReqRow = {
  title: string; location: string | null; work_model: string; placement_type: string
  pay_min: number | null; pay_max: number | null; bonus_note: string | null
  benefits: Benefits; benefits_other: string | null; benefits_summary: string | null
  job_description: string | null; brief: string | null; must_haves: string[]; hiring_manager_id: string | null
}

export function parseReqForm(v: FormValues, opts: { publish: boolean; isNew: boolean }): { data: ReqRow | null; errors: string[] } {
  const errors: string[] = []
  const t = (k: string) => one(v[k]).trim()

  if (!t('title')) errors.push('Title is required.')
  if (opts.isNew && !t('client_id')) errors.push('Choose a client.')

  const money = (k: string, label: string) => {
    if (!t(k)) return null
    const n = parseMoney(t(k))
    if (n === null) errors.push(`${label} should look like 135000 or 135k.`)
    return n
  }
  const payMin = money('pay_min', 'Base from'), payMax = money('pay_max', 'Base to')
  if (payMin !== null && payMax !== null && payMin > payMax) errors.push('The pay range is backwards. "From" is higher than "to".')

  let raw: unknown = {}
  try { raw = JSON.parse(t('benefits_json') || '{}') } catch { /* treated as nothing selected */ }
  const { benefits, errors: benefitErrors } = normalizeBenefits(raw)
  errors.push(...benefitErrors)
  const other = t('benefits_other')

  if (opts.publish) {
    if (payMin === null || payMax === null) errors.push('To publish, add both ends of the pay range. You can still save a draft.')
    if (!hasAnyBenefit(benefits, other)) errors.push('To publish, pick at least one benefit, or describe the benefits under "Additional benefits".')
  }

  const workModel = t('work_model') || 'onsite'
  if (!WORK_MODEL_OPTIONS.some(([k]) => k === workModel)) errors.push('Choose Onsite, Hybrid or Remote.')
  const placement = t('placement_type') || 'FTE'
  if (!PLACEMENT_TYPES.some(([k]) => k === placement)) errors.push('Choose a placement type from the list.')
  if (errors.length) return { data: null, errors }

  return {
    errors,
    data: {
      title: t('title').slice(0, 160), location: t('location') || null, work_model: workModel, placement_type: placement,
      pay_min: payMin, pay_max: payMax, bonus_note: t('bonus_note') || null,
      benefits, benefits_other: other || null, benefits_summary: benefitsSummary(benefits, other) || null,   // generated here, never taken from the browser
      job_description: t('job_description') || null, brief: t('brief') || null,
      must_haves: t('must_haves').split('\n').map((s) => s.trim()).filter(Boolean),
      hiring_manager_id: t('hiring_manager_id') || null,
    },
  }
}

// scorecard: true opens a hiring-manager scorecard automatically when a candidate enters the stage
export type Stage = { name: string; sla_days: number | null; waits_on: 'client' | 'agency' | 'candidate' | null; scorecard?: boolean }

export const DEFAULT_STAGES: Stage[] = [
  { name: 'Submitted', sla_days: null, waits_on: null },
  { name: 'Client review', sla_days: 3, waits_on: 'client' },
  { name: 'Interview 1', sla_days: 5, waits_on: 'client', scorecard: true },
  { name: 'Final round', sla_days: 5, waits_on: 'client', scorecard: true },
  { name: 'Offer', sla_days: null, waits_on: null },
]

export function freshness(status: string, workflow: Stage[], subs: { stage_index: number; status: string }[]) {
  if (status === 'draft') return 'Draft'
  if (status === 'filled') return 'Filled'
  const active = subs.filter((s) => s.status === 'active')
  const last = workflow.length - 1
  if (active.some((s) => s.stage_index === last)) return 'Offer out'
  if (active.some((s) => s.stage_index >= 2)) return 'Interviewing now'
  if (active.some((s) => s.stage_index === 1)) return 'Client reviewing'
  return 'Sourcing'
}

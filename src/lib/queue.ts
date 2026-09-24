export type QueueKind = 'client_feedback' | 'stalled' | 'touch'

export function queueLabel(kind: QueueKind, hours: number, overdueHours: number) {
  if (kind === 'client_feedback') return `${Math.round(hours)}h waiting`
  if (kind === 'stalled') return `${Math.round(hours / 24)}d in stage`
  return overdueHours >= 24 ? `${Math.floor(overdueHours / 24)}d overdue` : 'Due today'
}

export const queueGroup = (kind: QueueKind) =>
  kind === 'client_feedback' ? 'Client feedback' : kind === 'stalled' ? 'Stalled submission' : 'Candidate touch'

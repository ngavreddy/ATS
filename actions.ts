'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hashToken } from '@/lib/links'
import { applyRecommendation } from '@/lib/apply-decision'
import { validateScorecard, type Criterion, type Scores } from '@/lib/criteria'
import type { Recommendation } from '@/lib/decision'

// Every action on this public page re-checks the token and that the record belongs to this contact.
async function authorize(admin: any, token: string) {
  const { data: link } = await admin.from('feedback_links').select('contact_id, agency_id')
    .eq('token_hash', hashToken(token)).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (!link) throw new Error('This link has expired')
  return link as { contact_id: string; agency_id: string }
}

export async function decide(fd: FormData) {
  const token = String(fd.get('token'))
  const submissionId = String(fd.get('submission_id'))
  const decision = String(fd.get('decision'))
  if (!['interview', 'pass'].includes(decision)) throw new Error('Bad decision')

  const admin = supabaseAdmin()
  const link = await authorize(admin, token)

  // The submission must belong to a req this contact manages
  const { data: sub } = await admin.from('submissions')
    .select('id, agency_id, stage_index, reqs!inner(hiring_manager_id, workflow)')
    .eq('id', submissionId).eq('status', 'active').eq('reqs.hiring_manager_id', link.contact_id).maybeSingle()
  if (!sub) throw new Error('Not found')

  await admin.from('feedback').insert({
    agency_id: link.agency_id, submission_id: sub.id, contact_id: link.contact_id, decision,
    reason_code: decision === 'pass' ? String(fd.get('reason') || 'Other') : null,
  })
  await applyRecommendation(admin, sub, (sub.reqs as any).workflow, decision === 'interview' ? 'advance' : 'pass')
  revalidatePath(`/f/${token}`)
}

export async function approveCriteria(fd: FormData) {
  const token = String(fd.get('token'))
  const admin = supabaseAdmin()
  const link = await authorize(admin, token)
  const { data: set } = await admin.from('req_criteria_sets')
    .select('id, ai_audit_id, reqs!inner(hiring_manager_id)')
    .eq('id', String(fd.get('set_id'))).eq('status', 'pending_approval').eq('reqs.hiring_manager_id', link.contact_id).maybeSingle()
  if (!set) throw new Error('Not found')

  const now = new Date().toISOString()
  await admin.from('req_criteria_sets').update({ status: 'approved', approved_by_contact_id: link.contact_id, approved_at: now }).eq('id', set.id)
  // Record the human decision on the AI draft (audit trail)
  if (set.ai_audit_id)
    await admin.from('ai_audit_log').update({ human_decision: 'approved', decided_by_contact_id: link.contact_id, decided_at: now }).eq('id', set.ai_audit_id)
  revalidatePath(`/f/${token}`)
}

export async function requestCriteriaChanges(fd: FormData) {
  const token = String(fd.get('token'))
  const comment = String(fd.get('comment') || '').trim()
  if (!comment) redirect(`/f/${token}?error=${encodeURIComponent('Tell your recruiter what to change.')}`)
  const admin = supabaseAdmin()
  const link = await authorize(admin, token)
  const { data: set } = await admin.from('req_criteria_sets')
    .select('id, reqs!inner(hiring_manager_id)')
    .eq('id', String(fd.get('set_id'))).eq('status', 'pending_approval').eq('reqs.hiring_manager_id', link.contact_id).maybeSingle()
  if (!set) throw new Error('Not found')
  await admin.from('req_criteria_sets').update({ status: 'changes_requested', hm_comment: comment }).eq('id', set.id)
  revalidatePath(`/f/${token}`)
}

export async function submitScorecard(fd: FormData) {
  const token = String(fd.get('token'))
  const fail = (m: string) => redirect(`/f/${token}?error=${encodeURIComponent(m)}`)
  const admin = supabaseAdmin()
  const link = await authorize(admin, token)

  const { data: card } = await admin.from('scorecards')
    .select('id, stage_name, req_criteria_sets(criteria), submissions!inner(id, stage_index, stage_name, status, reqs(workflow))')
    .eq('id', String(fd.get('scorecard_id'))).eq('contact_id', link.contact_id).is('submitted_at', null).maybeSingle()
  if (!card) throw new Error('Not found')

  const criteria: Criterion[] = (card.req_criteria_sets as any).criteria
  const scores: Scores = {}
  for (const c of criteria) {
    const raw = fd.get(`level_${c.id}`)
    if (raw !== null && raw !== '') scores[c.id] = { level: Number(raw), note: String(fd.get(`note_${c.id}`) || '').trim() || undefined }
  }
  const rec = String(fd.get('recommendation') || '')
  const problems = validateScorecard(criteria, scores, rec)
  if (problems.length) fail(problems.join(' '))

  await admin.from('scorecards').update({
    ratings: scores, recommendation: rec, comment: String(fd.get('comment') || '').trim() || null,
    submitted_at: new Date().toISOString(),
  }).eq('id', card.id)

  // Only move the candidate if they are still at the stage this scorecard was for
  const sub = card.submissions as any
  if (sub.status === 'active' && sub.stage_name === card.stage_name)
    await applyRecommendation(admin, sub, sub.reqs.workflow, rec as Recommendation)
  revalidatePath(`/f/${token}`)
}

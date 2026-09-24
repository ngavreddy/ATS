'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { draftCriteria, MODEL } from '@/lib/claude'
import { validateCriteria, type Criterion } from '@/lib/criteria'
import { sendFeedbackLink } from '@/lib/nudge'

const back = (reqId: string, msg: string) => redirect(`/reqs/${reqId}/criteria?error=${encodeURIComponent(msg)}`)

// Every new draft retires any unfinished set (draft, pending or changes requested) so the hiring
// manager can never approve a stale version. The approved set stays in force until a newer one is approved.
async function openDraft(sb: any, reqId: string, fields: Record<string, unknown>) {
  await sb.from('req_criteria_sets').update({ status: 'superseded' })
    .eq('req_id', reqId).in('status', ['draft', 'pending_approval', 'changes_requested'])
  const { data } = await sb.from('req_criteria_sets').select('version').eq('req_id', reqId).order('version', { ascending: false }).limit(1)
  await sb.from('req_criteria_sets').insert({ req_id: reqId, version: (data?.[0]?.version ?? 0) + 1, status: 'draft', ...fields })
}

// Claude drafts. A person edits. The hiring manager approves.
export async function generateCriteria(reqId: string) {
  const sb = await supabaseServer()
  const { data: req } = await sb.from('reqs').select('title, job_description, brief, must_haves').eq('id', reqId).single()
  if (!req.job_description && !req.brief && !req.must_haves?.length)
    back(reqId, 'Add a job description, an intake brief or must-haves to the req first.')

  let out
  try {
    out = await draftCriteria({ title: req.title, jobDescription: req.job_description, brief: req.brief, mustHaves: req.must_haves ?? [] })
  } catch {
    back(reqId, 'Claude could not produce a valid draft. Try again, or start from a blank set.')
  }

  const { data: audit } = await sb.from('ai_audit_log').insert({
    feature: 'criteria_draft', model: MODEL, output: out, ref_type: 'req', ref_id: reqId,
    input_summary: `JD ${req.job_description?.length ?? 0} chars, brief ${req.brief?.length ?? 0} chars`,
  }).select('id').single()
  await openDraft(sb, reqId, { criteria: out.criteria, source: 'ai', ai_audit_id: audit.id })
  redirect(`/reqs/${reqId}/criteria`)
}

export async function startBlank(reqId: string) {
  const sb = await supabaseServer()
  await openDraft(sb, reqId, { criteria: [] })
  redirect(`/reqs/${reqId}/criteria`)
}

// Start a new draft from the current set (approved criteria are frozen, so changes mean a new version)
export async function newVersion(reqId: string, fromSetId: string) {
  const sb = await supabaseServer()
  const { data: from } = await sb.from('req_criteria_sets').select('criteria').eq('id', fromSetId).single()
  await openDraft(sb, reqId, { criteria: from.criteria, source: 'recruiter' })
  redirect(`/reqs/${reqId}/criteria`)
}

function readCriteria(fd: FormData): Criterion[] {
  const ids = fd.getAll('id').map(String)
  const remove = new Set(fd.getAll('remove').map(String))
  const names = fd.getAll('name'), kinds = fd.getAll('kind'), weights = fd.getAll('weight'), defs = fd.getAll('definition')
  return ids
    .map((id, i) => ({
      id: id || crypto.randomUUID(),
      name: String(names[i] ?? '').trim(),
      kind: (kinds[i] === 'nice' ? 'nice' : 'must') as Criterion['kind'],
      weight: Number(weights[i]) as Criterion['weight'],
      definition: String(defs[i] ?? '').trim(),
    }))
    .filter((c, i) => (c.name || c.definition) && !remove.has(ids[i]) )   // blank spare rows and removed rows drop out
}

export async function saveCriteria(reqId: string, setId: string, fd: FormData) {
  const sb = await supabaseServer()
  const criteria = readCriteria(fd)
  const { error } = await sb.from('req_criteria_sets').update({ criteria, status: 'draft', hm_comment: null }).eq('id', setId)
  if (error) back(reqId, error.message)

  if (fd.get('intent') !== 'send') redirect(`/reqs/${reqId}/criteria`)

  // Sending to the hiring manager: validate first (the draft is already saved, so nothing is lost)
  const errors = validateCriteria(criteria)
  if (errors.length) back(reqId, errors.join(' '))
  const { data: req } = await sb.from('reqs').select('title, hiring_manager_id').eq('id', reqId).single()
  if (!req.hiring_manager_id) back(reqId, 'Add a hiring manager to the req first. They approve the criteria.')

  await sb.from('req_criteria_sets').update({ status: 'pending_approval', sent_at: new Date().toISOString() }).eq('id', setId)
  try {
    await sendFeedbackLink(sb, req.hiring_manager_id, `Please approve the criteria for ${req.title}`,
      `Before I send you candidates for ${req.title}, I'd like you to confirm how we'll evaluate them. It takes about two minutes.`)
  } catch {
    back(reqId, 'Marked as sent, but the email failed. Use "Resend link" to try again.')
  }
  redirect(`/reqs/${reqId}/criteria`)
}

export async function resendCriteriaLink(reqId: string) {
  const sb = await supabaseServer()
  const { data: req } = await sb.from('reqs').select('title, hiring_manager_id').eq('id', reqId).single()
  await sendFeedbackLink(sb, req.hiring_manager_id, `Reminder: approve the criteria for ${req.title}`,
    `A quick reminder: I'm holding candidates for ${req.title} until you've approved how we'll evaluate them.`)
  revalidatePath(`/reqs/${reqId}/criteria`)
  revalidatePath('/today')
}

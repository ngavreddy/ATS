'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { fit } from '@/lib/filters'
import { sendFeedbackLink } from '@/lib/nudge'
import { validateAssessment, type Criterion, type Ratings, type Status } from '@/lib/criteria'

export async function addCandidate(fd: FormData) {
  const sb = await supabaseServer()
  const prefs = {
    comp_floor: fd.get('comp_floor') ? Number(fd.get('comp_floor')) : undefined,
    work_models: fd.getAll('work_models').map(String),
    dealbreakers: String(fd.get('dealbreakers') || '').split(',').map((s) => s.trim()).filter(Boolean),
  }
  const { data, error } = await sb.from('candidates').insert({
    full_name: fd.get('full_name'), email: fd.get('email') || null, phone: fd.get('phone') || null,
    headline: fd.get('headline') || null, metro: fd.get('metro') || null, source: fd.get('source') || null, prefs,
  }).select('id').single()
  if (error) throw new Error(error.message)
  redirect(`/candidates/${data.id}`)
}

export async function addNote(fd: FormData) {
  const sb = await supabaseServer()
  const cid = String(fd.get('candidate_id'))
  const scope = String(fd.get('scope'))
  await sb.from('notes').insert({
    candidate_id: cid, submission_id: scope === 'general' ? null : scope,
    kind: String(fd.get('kind') || 'note'), body: String(fd.get('body')),
  })
  revalidatePath(`/candidates/${cid}`)
}

export async function submitCandidate(fd: FormData) {
  const sb = await supabaseServer()
  const cid = String(fd.get('candidate_id'))
  const rid = String(fd.get('req_id'))
  const back = (m: string) => redirect(`/candidates/${cid}/submit/${rid}?error=${encodeURIComponent(m)}`)

  if (!fd.get('consent')) back('Confirm the candidate agreed to be submitted.')

  const { data: cand } = await sb.from('candidates').select('*').eq('id', cid).single()
  const { data: req } = await sb.from('reqs').select('*, clients(name)').eq('id', rid).single()

  // Re-check everything server-side. Never trust the form.
  if (req.status !== 'live') back('That req is not live.')
  const f = fit(cand.prefs, req)
  if (!f.ok) back(`Breaks a hard filter: ${f.reasons.join(', ')}`)

  const { data: set } = await sb.from('req_criteria_sets').select('id, criteria').eq('req_id', rid).eq('status', 'approved').maybeSingle()
  if (!set) back('The hiring manager has not approved the criteria yet.')

  const ratings: Ratings = {}
  for (const c of set.criteria as Criterion[]) {
    const status = String(fd.get(`status_${c.id}`) || '')
    if (status) ratings[c.id] = { status: status as Status, evidence: String(fd.get(`evidence_${c.id}`) || '').trim() }
  }
  const problems = validateAssessment(set.criteria, ratings)
  if (problems.length) back(problems.join(' '))

  const now = new Date().toISOString()
  const first = req.workflow[0]
  const { data: sub, error } = await sb.from('submissions').insert({
    candidate_id: cid, req_id: rid, stage_index: 0, stage_name: first.name,
    candidate_consent_at: now, introduced_at: now, source: cand.source,
    next_touch_at: new Date(Date.now() + 864e5).toISOString(),
    next_touch_note: `Tell ${cand.full_name.split(' ')[0]} the submission went to ${req.clients.name}`,
  }).select('id').single()
  if (error) back(error.code === '23505' ? 'Already submitted to this req.' : error.message)

  await sb.from('submission_assessments').insert({ submission_id: sub.id, criteria_set_id: set.id, ratings })

  const note = String(fd.get('note') || '').trim()
  if (note) await sb.from('notes').insert({ candidate_id: cid, submission_id: sub.id, kind: 'note', body: `Submittal note: ${note}` })

  if (req.hiring_manager_id) {
    try {
      await sendFeedbackLink(sb, req.hiring_manager_id,
        `${cand.full_name} for ${req.title}`, `I've submitted ${cand.full_name} for ${req.title}. Your feedback takes about a minute.`)
    } catch (e) { console.error(e) } // submission stands even if email fails
  }
  redirect(`/candidates/${cid}`)
}

'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { fit } from '@/lib/filters'
import { greetingName } from '@/lib/names'
import { explainDbError } from '@/lib/db-errors'
import { failTo } from '@/lib/redirect-error'
import { one, readValues, retry, type FormState } from '@/lib/form-state'
import { parseCandidate, prefsOf } from '@/lib/candidate'
import { checkResumeFile, detectKind, extractResumeText, MIN_RESUME_TEXT, normalizeParsed, resumeWasEdited } from '@/lib/resume'
import { readResume, RESUME_MODEL } from '@/lib/claude'
import { sendFeedbackLink } from '@/lib/nudge'
import { validateAssessment, type Criterion, type Ratings, type Status } from '@/lib/criteria'

const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain' }

// Upload a resume, read its text, and (optionally) let Claude pre-fill the form. Nothing is saved as a candidate yet.
async function handleResume(fd: FormData, useClaude: boolean): Promise<never> {
  const NEW = '/candidates/new'
  const file = fd.get('resume')
  if (!(file instanceof File) || file.size === 0) failTo(NEW, 'Choose a resume file first.')
  const tooBad = checkResumeFile(file.name, file.size)
  if (tooBad) failTo(NEW, tooBad)
  const buf = Buffer.from(await file.arrayBuffer())
  const kind = detectKind(buf, file.name)
  if (!kind) failTo(NEW, "That file doesn't look like a real PDF, Word or text file.")

  let text = ''
  try { text = await extractResumeText(buf, kind) } catch (e) { console.error('resume text extraction failed', e) }
  if (useClaude && text.length < MIN_RESUME_TEXT)
    failTo(NEW, "We couldn't read any text in that file. It may be a scan or a password-protected PDF. Upload a text-based PDF or Word file, or use \"Attach without reading\" and fill the form yourself.")

  const sb = await supabaseServer()
  const { data: agencyId } = await sb.rpc('current_agency')
  if (!agencyId) failTo(NEW, 'new row violates row-level security policy')

  const id = crypto.randomUUID()
  const path = `${agencyId}/${id}.${kind}`
  const { error: rowError } = await sb.from('resume_uploads').insert({ id, storage_path: path, filename: file.name.slice(0, 200), size_bytes: file.size, extracted_text: text || null })
  if (rowError) failTo(NEW, rowError.message)
  const up = await sb.storage.from('resumes').upload(path, buf, { contentType: MIME[kind], upsert: false })
  if (up.error) {
    await sb.from('resume_uploads').delete().eq('id', id)
    failTo(NEW, `The file could not be stored: ${up.error.message}. Open the Setup check to confirm resume storage is set up.`)
  }

  let parsed = normalizeParsed({}, text)          // email and phone found by simple pattern matching
  let by: 'claude' | 'regex' = 'regex'
  let aiId: string | null = null
  let aiFailed = false
  if (useClaude) {
    try {
      parsed = await readResume(text)
      by = 'claude'
      const { data: audit } = await sb.from('ai_audit_log').insert({
        feature: 'resume_parse', model: RESUME_MODEL, input_summary: `Resume, ${text.length} characters`, output: parsed, ref_type: 'resume_upload', ref_id: id,
      }).select('id').single()
      aiId = audit?.id ?? null
    } catch (e) { console.error('resume read by Claude failed', e); aiFailed = true }
  }
  await sb.from('resume_uploads').update({ parsed, parsed_by: by, ai_audit_id: aiId }).eq('id', id)
  redirect(`${NEW}?resume=${id}${aiFailed ? '&note=ai' : ''}`)
}
export async function readResumeAndFill(fd: FormData) { return handleResume(fd, true) }
export async function attachResumeOnly(fd: FormData) { return handleResume(fd, false) }

// Creates a candidate, or edits one when candidate_id is present. A problem sends the form back with everything still typed in.
export async function saveCandidate(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = readValues(fd)
  const candidateId = one(values.candidate_id).trim()
  const uploadId = one(values.resume_upload_id).trim()
  const r = parseCandidate(values)
  if (!r.data) return retry(r.errors.join(' '), values)
  const sb = await supabaseServer()

  // One record per person: same email or phone means they are already here
  for (const [col, val] of [['email', r.data.email], ['phone', r.data.phone]] as const) {
    if (!val) continue
    let q = sb.from('candidates').select('id, full_name').eq(col, val).limit(1)
    if (candidateId) q = q.neq('id', candidateId)
    const { data: dup } = await q
    if (dup?.length) return retry(`${dup[0].full_name} is already in your database with that ${col === 'email' ? 'email address' : 'phone number'}.`, values,
      { linkHref: `/candidates/${dup[0].id}`, linkText: `Open ${dup[0].full_name}'s profile` })
  }

  if (candidateId) {
    const { error } = await sb.from('candidates').update(r.data).eq('id', candidateId)
    if (error) return retry(explainDbError(error.message), values)
    revalidatePath('/candidates'); revalidatePath(`/candidates/${candidateId}`)
    redirect(`/candidates/${candidateId}`)
  }

  let resume: { resume_path?: string; resume_filename?: string; resume_text?: string | null } = {}
  let upload: any = null
  if (uploadId) {
    const { data } = await sb.from('resume_uploads').select('id, storage_path, filename, extracted_text, parsed, ai_audit_id, candidate_id').eq('id', uploadId).maybeSingle()
    if (data && !data.candidate_id) { upload = data; resume = { resume_path: data.storage_path, resume_filename: data.filename, resume_text: data.extracted_text } }
  }
  const { data, error } = await sb.from('candidates').insert({ ...r.data, ...resume }).select('id').single()
  if (error) return retry(explainDbError(error.message), values)

  if (upload) {
    await sb.from('resume_uploads').update({ candidate_id: data.id }).eq('id', upload.id)
    if (upload.ai_audit_id) {
      const { data: { user } } = await sb.auth.getUser()
      await sb.from('ai_audit_log').update({
        human_decision: resumeWasEdited(upload.parsed, r.data) ? 'edited' : 'accepted', decided_by: user?.id ?? null, decided_at: new Date().toISOString(),
      }).eq('id', upload.ai_audit_id)
    }
  }
  revalidatePath('/candidates')
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
  const f = fit(prefsOf(cand), req)
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
    next_touch_note: `Tell ${greetingName(cand)} the submission went to ${req.clients.name}`,
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

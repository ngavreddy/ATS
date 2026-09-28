'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { closeSubmission } from '@/lib/close'
import { addDays } from '@/lib/dates'
import { computeFee, invoiceDates } from '@/lib/fees'
import { DEFAULT_STAGES } from '@/lib/workflow'
import { explainDbError } from '@/lib/db-errors'
import { one, readValues, retry, type FormState } from '@/lib/form-state'
import { parseReqForm } from '@/lib/req-form'

// One action creates a req and edits one. When something is wrong the form comes back with everything still typed in.
export async function saveReq(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = readValues(fd)
  const reqId = one(values.req_id).trim()
  const intent = one(values.intent)
  const publish = intent === 'publish'

  const r = parseReqForm(values, { publish, isNew: !reqId })
  if (!r.data) return retry(r.errors.join(' '), values)
  const sb = await supabaseServer()

  if (reqId) {
    const { data: cur } = await sb.from('reqs').select('status').eq('id', reqId).maybeSingle()
    if (!cur) return retry('That req could not be found.', values)
    if (!['draft', 'live', 'on_hold'].includes(cur.status)) return retry('Closed and filled reqs cannot be edited.', values)
    const change = publish && cur.status === 'draft' ? { status: 'live', published_at: new Date().toISOString() } : {}
    const { error } = await sb.from('reqs').update({ ...r.data, ...change }).eq('id', reqId)
    if (error) return retry(explainDbError(error.message), values)
    revalidatePath(`/reqs/${reqId}`); revalidatePath('/reqs')
    redirect(`/reqs/${reqId}`)
  }

  const clientId = one(values.client_id).trim()
  const { data: tpl } = await sb.from('workflow_templates').select('stages').eq('client_id', clientId).limit(1).maybeSingle()
  const { data, error } = await sb.from('reqs').insert({
    ...r.data, client_id: clientId,
    workflow: tpl?.stages ?? DEFAULT_STAGES,   // cloned: later template edits never touch this req
    status: publish ? 'live' : 'draft', published_at: publish ? new Date().toISOString() : null,
  }).select('id').single()
  if (error) return retry(explainDbError(error.message), values)
  revalidatePath('/reqs')
  redirect(`/reqs/${data.id}`)
}

export async function publishReq(reqId: string) {
  const sb = await supabaseServer()
  const { error } = await sb.from('reqs').update({ status: 'live', published_at: new Date().toISOString() }).eq('id', reqId)
  if (error) redirect(`/reqs/${reqId}?error=${encodeURIComponent('Add a pay range and at least one benefit first. Use Edit.')}`)
  revalidatePath(`/reqs/${reqId}`)
}

export async function advanceSubmission(submissionId: string) {
  const sb = await supabaseServer()
  const { data: s } = await sb.from('submissions').select('id, req_id, stage_index, reqs(workflow)').eq('id', submissionId).single()
  const wf = s.reqs.workflow
  const next = Math.min(s.stage_index + 1, wf.length - 1)
  await sb.from('submissions').update({ stage_index: next, stage_name: wf[next].name }).eq('id', s.id)
  revalidatePath(`/reqs/${s.req_id}`)
}

export async function closeOne(submissionId: string) {
  const sb = await supabaseServer()
  const { data: s } = await sb.from('submissions')
    .select('id, candidate_id, req_id, stage_index, candidates(full_name, first_name, preferred_name, email), reqs(title, clients(name))')
    .eq('id', submissionId).single()
  await closeSubmission(sb, s, s.reqs.title, s.reqs.clients.name)
  revalidatePath(`/reqs/${s.req_id}`)
}

export async function recordPlacement(fd: FormData) {
  const sb = await supabaseServer()
  const submissionId = String(fd.get('submission_id'))
  const salary = Number(fd.get('salary'))
  const start = String(fd.get('start_date'))

  const { data: s } = await sb.from('submissions').select('id, req_id, reqs(client_id, placement_type)').eq('id', submissionId).single()
  const { data: msa } = await sb.from('msas').select('*').eq('client_id', s.reqs.client_id)
    .eq('status', 'active').order('signed_on', { ascending: false }).limit(1).maybeSingle()

  if (!msa) redirect(`/reqs/${s.req_id}?error=${encodeURIComponent('This client has no active contract yet. Add contract terms on the client page, then record the placement.')}`)
  const fee = computeFee(salary, Number(msa.fee_pct))
  const { data: p, error } = await sb.from('placements').insert({
    submission_id: s.id, msa_id: msa.id, type: s.reqs.placement_type,
    base_salary: salary, fee_pct: msa.fee_pct, fee_amount: fee, start_date: start,
    guarantee_days: msa.guarantee_days, guarantee_end: addDays(start, msa.guarantee_days),
    payment_terms_days: msa.payment_terms_days,
  }).select('id').single()
  if (error) redirect(`/reqs/${s.req_id}?error=${encodeURIComponent(error.message)}`)

  const { issue, due } = invoiceDates(start, msa.payment_terms_days)
  await sb.from('invoices').insert({ placement_id: p.id, amount: fee, issue_date: issue, due_date: due })
  await sb.from('submissions').update({ status: 'closed', outcome: 'placed' }).eq('id', s.id)
  await sb.from('reqs').update({ status: 'filled' }).eq('id', s.req_id)
  redirect(`/placements/${p.id}`)
}

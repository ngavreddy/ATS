'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { closeSubmission } from '@/lib/close'
import { addDays } from '@/lib/dates'
import { computeFee, invoiceDates } from '@/lib/fees'

const numOrNull = (v: FormDataEntryValue | null) => (v && String(v).trim() ? Number(v) : null)

export async function saveReq(fd: FormData) {
  const sb = await supabaseServer()
  const publish = fd.get('intent') === 'publish'
  const clientId = String(fd.get('client_id'))

  const { data: tpl } = await sb.from('workflow_templates').select('stages').eq('client_id', clientId).limit(1).single()

  const row = {
    client_id: clientId,
    hiring_manager_id: fd.get('hiring_manager_id') || null,
    title: String(fd.get('title')),
    location: fd.get('location') || null,
    work_model: fd.get('work_model') || null,
    placement_type: String(fd.get('placement_type') || 'FTE'),
    pay_min: numOrNull(fd.get('pay_min')),
    pay_max: numOrNull(fd.get('pay_max')),
    bonus_note: fd.get('bonus_note') || null,
    benefits_summary: fd.get('benefits_summary') || null,
    job_description: fd.get('job_description') || null,
    brief: fd.get('brief') || null,
    must_haves: String(fd.get('must_haves') || '').split('\n').map((s) => s.trim()).filter(Boolean),
    workflow: tpl?.stages ?? [],            // cloned: later template edits never touch this req
    status: publish ? 'live' : 'draft',
    published_at: publish ? new Date().toISOString() : null,
  }
  const { data, error } = await sb.from('reqs').insert(row).select('id').single()
  if (error) {
    const msg = publish ? 'Add a valid pay range and a benefits summary to publish.' : error.message
    redirect(`/reqs/new?error=${encodeURIComponent(msg)}`)
  }
  redirect(`/reqs/${data.id}`)
}

export async function publishReq(reqId: string) {
  const sb = await supabaseServer()
  const { error } = await sb.from('reqs').update({ status: 'live', published_at: new Date().toISOString() }).eq('id', reqId)
  if (error) redirect(`/reqs/${reqId}?error=${encodeURIComponent('Add a pay range and benefits summary first.')}`)
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
    .select('id, candidate_id, req_id, stage_index, candidates(full_name, email), reqs(title, clients(name))')
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
    .eq('status', 'active').order('signed_on', { ascending: false }).limit(1).single()

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

import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { draftReqFromTranscript, MODEL } from '@/lib/claude'

async function intake(fd: FormData) {
  'use server'
  if (!fd.get('consent')) redirect('/reqs/intake?error=Confirm+all+parties+consented+to+the+recording.')
  const sb = await supabaseServer()
  const transcript = String(fd.get('transcript'))
  let d
  try { d = await draftReqFromTranscript(transcript) }
  catch { redirect('/reqs/intake?error=' + encodeURIComponent('Claude could not produce a valid draft. Try again or shorten the transcript.')) }

  const clientId = String(fd.get('client_id'))
  const { data: tpl } = await sb.from('workflow_templates').select('stages').eq('client_id', clientId).limit(1).single()

  // Always a DRAFT. A person reviews it and publishes it.
  const { data: req, error } = await sb.from('reqs').insert({
    client_id: clientId, title: d.title, location: d.location, work_model: d.work_model,
    pay_min: d.pay_min, pay_max: d.pay_max, benefits_summary: d.benefits_summary,
    must_haves: d.must_haves, brief: transcript, job_description: d.job_description, sourcing_string: d.sourcing_string,
    workflow: tpl?.stages ?? [], status: 'draft',
  }).select('id').single()
  if (error) redirect('/reqs/intake?error=' + encodeURIComponent(error.message))

  await sb.from('ai_audit_log').insert({
    feature: 'req_intake', model: MODEL, input_summary: `Transcript, ${transcript.length} chars`,
    output: d, ref_type: 'req', ref_id: req.id,
  })
  redirect(`/reqs/${req.id}`)
}

export default async function Intake({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const sb = await supabaseServer()
  const { data: clients } = await sb.from('clients').select('id, name').order('name')
  return (
    <form action={intake} className="max-w-3xl space-y-4">
      <h1>AI intake</h1>
      <p className="text-muted">Paste the transcript of your req brief. Claude drafts the req. Nothing goes live until you publish it.</p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error}</p>}
      <select name="client_id" required className="input">{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <textarea name="transcript" required rows={16} className="input" placeholder="Paste transcript…" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent" /> Everyone on this call consented to it being recorded and transcribed (Illinois requires all-party consent).</label>
      <button className="btn-dark">Draft req with Claude</button>
      <p className="text-xs text-muted">Recruiters and clients are told when AI is used. Each output is logged with your decision.</p>
    </form>
  )
}

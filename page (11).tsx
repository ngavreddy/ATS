import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { fmt } from '@/lib/dates'
import type { Criterion } from '@/lib/criteria'
import { generateCriteria, newVersion, resendCriteriaLink, saveCriteria, startBlank } from './actions'

const STATUS: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Waiting on hiring manager', changes_requested: 'Changes requested',
  approved: 'Approved', superseded: 'Superseded',
}

export default async function CriteriaPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const sb = await supabaseServer()
  const { data: req } = await sb.from('reqs').select('title, job_description, brief, clients(name), contacts:hiring_manager_id(name)').eq('id', id).single()
  const { data: sets } = await sb.from('req_criteria_sets')
    .select('*, ai_audit_log(output), approver:approved_by_contact_id(name)').eq('req_id', id).order('version', { ascending: false })
  const cur = sets?.[0]
  const approved = sets?.find((s: any) => s.status === 'approved')
  const editable = cur && ['draft', 'changes_requested'].includes(cur.status)
  const hm = req.contacts?.name ?? 'the hiring manager'
  const openQuestions: string[] = cur?.ai_audit_log?.output?.open_questions ?? []
  const criteria: Criterion[] = cur?.criteria ?? []

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href={`/reqs/${id}`} className="text-sm text-muted">{req.title} /</Link>
        <h1>Evaluation criteria</h1>
        <p className="mt-1 text-muted">{req.title} · {req.clients.name}. {hm} approves these before any candidate is submitted. They become your assessment at submission and {hm}'s scorecard at interview.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error}</p>}

      {!cur && (
        <div className="card space-y-4 p-6">
          <p className="text-sm">No criteria yet. Claude can draft them from the job description and intake brief on this req. You edit, then send to {hm}.</p>
          <div className="flex gap-3">
            <form action={generateCriteria.bind(null, id)}><button className="btn-dark">Draft with Claude</button></form>
            <form action={startBlank.bind(null, id)}><button className="btn">Start blank</button></form>
          </div>
          {!req.job_description && !req.brief && <p className="text-xs text-warn">This req has no job description or brief yet, so Claude has little to work from.</p>}
        </div>
      )}

      {cur && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="chip">Version {cur.version}</span>
          <span className="chip">{STATUS[cur.status]}</span>
          {cur.source === 'ai' && <span className="chip">Drafted by Claude · reviewed by you</span>}
          {cur.status === 'approved' && <span className="text-muted">Approved by {cur.approver?.name} on {fmt(cur.approved_at)}</span>}
          {cur.status === 'pending_approval' && <span className="text-muted">Sent {fmt(cur.sent_at)}</span>}
        </div>
      )}

      {cur?.status === 'changes_requested' && cur.hm_comment && (
        <div className="rounded-lg border border-line bg-white p-4 text-sm"><div className="label">{hm} asked for changes</div>{cur.hm_comment}</div>
      )}
      {cur && cur.status !== 'approved' && approved && (
        <p className="text-sm text-muted">Version {approved.version} stays in force until this one is approved. Candidates can still be submitted against it.</p>
      )}
      {editable && openQuestions.length > 0 && (
        <div className="card p-4 text-sm"><div className="label">Claude's open questions for {hm}</div>
          <ul className="list-disc pl-5">{openQuestions.map((q) => <li key={q}>{q}</li>)}</ul></div>
      )}

      {editable && (
        <form action={saveCriteria.bind(null, id, cur.id)} className="space-y-4">
          {[...criteria, { id: '', name: '', kind: 'nice', weight: 2, definition: '' }, { id: '', name: '', kind: 'nice', weight: 2, definition: '' }].map((c: any, i) => (
            <div key={c.id || `new${i}`} className="card grid grid-cols-[1fr_120px_100px] gap-3 p-4">
              <input type="hidden" name="id" value={c.id} />
              <div><label className="label">{c.id ? 'Criterion' : 'Add another'}</label><input name="name" defaultValue={c.name} className="input" placeholder="Short and specific" /></div>
              <div><label className="label">Type</label>
                <select name="kind" defaultValue={c.kind} className="input"><option value="must">Must-have</option><option value="nice">Nice-to-have</option></select></div>
              <div><label className="label">Weight</label>
                <select name="weight" defaultValue={c.weight} className="input"><option value={3}>3 Critical</option><option value={2}>2 Important</option><option value={1}>1 Helpful</option></select></div>
              <div className="col-span-full"><label className="label">What strong evidence looks like</label>
                <textarea name="definition" defaultValue={c.definition} rows={2} className="input" placeholder="Observable work, outcomes or scale a candidate could describe" /></div>
              {c.id && <label className="col-span-full flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="remove" value={c.id} /> Remove this criterion</label>}
            </div>
          ))}
          <div className="flex gap-3">
            <button name="intent" value="save" className="btn">Save draft</button>
            <button name="intent" value="send" className="btn-dark">Send to {hm} for approval</button>
          </div>
          <p className="text-xs text-muted">4 to 8 criteria works best. Every criterion must be job-related. Wording that can act as a proxy for age, ZIP code, family status and similar is blocked before it can be sent.</p>
        </form>
      )}

      {cur && !editable && (
        <div className="card divide-y divide-line">
          {criteria.map((c) => (
            <div key={c.id} className="p-4">
              <div className="flex items-center gap-2"><span className="font-medium">{c.name}</span>
                <span className="chip">{c.kind === 'must' ? 'Must-have' : 'Nice-to-have'}</span><span className="chip">Weight {c.weight}</span></div>
              <p className="mt-1 text-sm text-muted">{c.definition}</p>
            </div>
          ))}
        </div>
      )}

      {cur?.status === 'pending_approval' && (
        <form action={resendCriteriaLink.bind(null, id)}><button className="btn">Resend link to {hm}</button></form>
      )}
      {cur?.status === 'approved' && (
        <form action={newVersion.bind(null, id, cur.id)}><button className="btn">Create a new version to edit</button>
          <p className="mt-2 text-xs text-muted">Approved criteria are frozen so scorecards stay comparable. A new version needs {hm}'s approval again.</p></form>
      )}
      {cur && cur.status !== 'approved' && (
        <form action={generateCriteria.bind(null, id)}><button className="btn">Regenerate with Claude</button>
          <p className="mt-2 text-xs text-muted">Creates a new draft version. Nothing is overwritten.</p></form>
      )}
    </div>
  )
}

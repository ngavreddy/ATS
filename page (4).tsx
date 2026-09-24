import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { fit } from '@/lib/filters'
import { fmt } from '@/lib/dates'
import { STATUS_LABEL, STATUSES, type Criterion } from '@/lib/criteria'
import { submitCandidate } from '../../../actions'

export default async function SubmitPage({ params, searchParams }: {
  params: Promise<{ id: string; reqId: string }>; searchParams: Promise<{ error?: string }>
}) {
  const { id, reqId } = await params
  const { error } = await searchParams
  const sb = await supabaseServer()
  const { data: c } = await sb.from('candidates').select('*').eq('id', id).single()
  const { data: req } = await sb.from('reqs').select('*, clients(name)').eq('id', reqId).single()
  const { data: set } = await sb.from('req_criteria_sets').select('id, version, criteria').eq('req_id', reqId).eq('status', 'approved').maybeSingle()
  const { data: prior } = await sb.from('submissions').select('introduced_at, reqs!inner(client_id)').eq('candidate_id', id).eq('reqs.client_id', req.client_id).limit(1)
  const f = fit(c.prefs ?? {}, req)
  const first = c.full_name.split(' ')[0]

  if (!set || !f.ok) {
    return (
      <div className="max-w-xl space-y-3">
        <h1>Can't submit yet</h1>
        <p className="text-muted">{!f.ok ? `${first} breaks a hard filter: ${f.reasons.join(', ')}.` : 'The hiring manager has not approved the criteria for this req yet.'}</p>
        <Link href={`/candidates/${id}`} className="btn">Back</Link>
      </div>
    )
  }
  const criteria: Criterion[] = set.criteria

  return (
    <form action={submitCandidate} className="max-w-3xl space-y-6">
      <input type="hidden" name="candidate_id" value={id} /><input type="hidden" name="req_id" value={reqId} />
      <div>
        <Link href={`/candidates/${id}`} className="text-sm text-muted">{c.full_name} /</Link>
        <h1>Submit {first}</h1>
        <p className="mt-1 text-muted">{req.title} · {req.clients.name} · ${req.pay_min / 1000}–{req.pay_max / 1000}k. Rate {first} against the criteria your hiring manager approved (version {set.version}). Your ratings appear on their review page.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error}</p>}
      {prior?.[0] && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{req.clients.name} already knows {first}: introduced {fmt(prior[0].introduced_at)}. Covered by the non-circumvention term.</div>}

      {criteria.map((k) => (
        <div key={k.id} className="card space-y-3 p-4">
          <div><div className="flex items-center gap-2"><span className="font-medium">{k.name}</span>
            <span className="chip">{k.kind === 'must' ? 'Must-have' : 'Nice-to-have'}</span></div>
            <p className="mt-1 text-sm text-muted">{k.definition}</p></div>
          <div className="grid grid-cols-[160px_1fr] gap-3">
            <select name={`status_${k.id}`} defaultValue="" className="input">
              <option value="">{k.kind === 'must' ? 'Choose…' : 'Skip'}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <input name={`evidence_${k.id}`} placeholder="Evidence: what in their background shows this?" className="input" />
          </div>
        </div>
      ))}

      <div className="card space-y-3 p-4">
        <label className="label">Your note to the hiring manager</label>
        <textarea name="note" rows={3} className="input" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consent" /> {first} agreed to be submitted to this role (logged with date and time)</label>
      </div>
      <button className="btn-dark">Submit to {req.clients.name}</button>
      <p className="text-xs text-muted">"Met" and "Partial" need evidence. "Unknown" is a valid answer when you haven't confirmed it yet, and the hiring manager will see it as unknown.</p>
    </form>
  )
}

import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { advanceSubmission, closeOne, publishReq, recordPlacement } from '../actions'
import { scorecardSummary, type Criterion } from '@/lib/criteria'

export default async function ReqDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const sb = await supabaseServer()
  const { data: r } = await sb.from('reqs').select('*, clients(name), contacts:hiring_manager_id(name)').eq('id', id).single()
  const { data: subs } = await sb.from('submissions')
    .select('id, stage_index, stage_name, status, outcome, candidates(id, full_name, headline)')
    .eq('req_id', id).order('created_at')
  const last = r.workflow.length - 1

  const { data: sets } = await sb.from('req_criteria_sets').select('version, status').eq('req_id', id).order('version', { ascending: false })
  const approvedSet = sets?.find((x: any) => x.status === 'approved')
  const openSet = sets?.find((x: any) => ['draft', 'pending_approval', 'changes_requested'].includes(x.status))
  const { data: cards } = await sb.from('scorecards')
    .select('submission_id, stage_name, recommendation, submitted_at, ratings, req_criteria_sets(criteria)')
    .in('submission_id', (subs ?? []).map((x: any) => x.id).concat(['00000000-0000-0000-0000-000000000000']))
  const REC: Record<string, string> = { advance: 'Move forward', another_round: 'One more conversation', pass: 'Pass' }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1>{r.title} <span className="chip align-middle text-sm">{r.status}</span></h1>
          <p className="mt-1 text-muted">{r.clients.name} · {r.contacts?.name} · {r.pay_min ? `$${r.pay_min / 1000}–${r.pay_max / 1000}k` : 'No pay range yet'}</p>
        </div>
        <div className="flex gap-2">
          {r.status === 'draft' && <form action={publishReq.bind(null, id)}><button className="btn-dark">Publish</button></form>}
          {r.status !== 'closed' && r.status !== 'draft' && <Link href={`/reqs/${id}/close`} className="btn">Close req</Link>}
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error}</p>}

      <div className={`card flex items-center justify-between p-4 text-sm ${approvedSet ? '' : 'border-amber-300'}`}>
        <div>
          <span className="font-medium">Evaluation criteria: </span>
          {approvedSet ? `approved (version ${approvedSet.version})` : openSet ? { draft: 'draft, not sent yet', pending_approval: 'waiting on the hiring manager', changes_requested: 'changes requested' }[openSet.status as string] : 'not started'}
          {openSet && approvedSet && <span className="text-muted"> · version {openSet.version} in progress</span>}
          {!approvedSet && <div className="text-xs text-warn">Candidates cannot be submitted until the hiring manager approves the criteria.</div>}
        </div>
        <Link href={`/reqs/${id}/criteria`} className="btn">{approvedSet || openSet ? 'View criteria' : 'Set up criteria'}</Link>
      </div>

      <div className="card divide-y divide-line">
        {subs?.length === 0 && <p className="p-4 text-sm text-muted">No submissions yet. Submit candidates from their profile.</p>}
        {subs?.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <Link href={`/candidates/${s.candidates.id}`} className="font-medium">{s.candidates.full_name}</Link>
              <div className="text-sm text-muted">{s.candidates.headline}</div>
              <div className="mt-2 flex gap-1">
                {r.workflow.map((st: any, i: number) => (
                  <span key={i} className={`h-1 w-12 rounded ${i <= s.stage_index ? 'bg-ink' : 'bg-stone-200'}`} title={st.name} />
                ))}
              </div>
              <div className="mt-1 text-xs">{s.status === 'closed' ? `Closed · ${s.outcome}` : s.stage_name}</div>
              {cards?.filter((k: any) => k.submission_id === s.id).map((k: any) => {
                const sum = scorecardSummary((k.req_criteria_sets?.criteria ?? []) as Criterion[], k.ratings ?? {})
                return <div key={k.stage_name} className="mt-1 text-xs text-muted">
                  Scorecard · {k.stage_name}: {k.submitted_at ? `${sum.pct}% · ${REC[k.recommendation]}${sum.mustGaps.length ? ` · no evidence on: ${sum.mustGaps.join(', ')}` : ''}` : 'waiting on hiring manager'}</div>
              })}
            </div>
            {s.status === 'active' && (
              <div className="flex items-center gap-2">
                {s.stage_index === last ? (
                  <form action={recordPlacement} className="flex items-center gap-2">
                    <input type="hidden" name="submission_id" value={s.id} />
                    <input name="salary" type="number" placeholder="Base salary" required className="input w-32" />
                    <input name="start_date" type="date" required className="input w-40" />
                    <button className="btn-dark">Record placement</button>
                  </form>
                ) : (
                  <form action={advanceSubmission.bind(null, s.id)}><button className="btn-dark">Advance</button></form>
                )}
                <form action={closeOne.bind(null, s.id)}><button className="btn">Send disposition &amp; close</button></form>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

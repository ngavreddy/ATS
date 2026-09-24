import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { nudgeClient, snooze, touchDone } from './actions'
import { resendCriteriaLink } from '../reqs/[id]/criteria/actions'
import { queueGroup, queueLabel } from '@/lib/queue'

export default async function Today({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'all' } = await searchParams
  const sb = await supabaseServer()
  const { data: all } = await sb.from('today_queue').select('*').order('overdue_hours', { ascending: false })
  const { data: filled } = await sb.from('reqs').select('id, title, clients(name), submissions(status)').eq('status', 'filled')

  const { data: pendingSets } = await sb.from('req_criteria_sets')
    .select('id, req_id, status, sent_at, reqs(title, clients(name), contacts:hiring_manager_id(name))')
    .in('status', ['pending_approval', 'changes_requested'])

  const rows = (all ?? []).filter((r) => tab === 'all' || r.kind === tab)
  const closing = (filled ?? []).map((r) => ({ ...r, open: r.submissions.filter((s: any) => s.status === 'active').length }))
  const count = (k: string) => (all ?? []).filter((r) => r.kind === k).length

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div>
          <p className="font-mono text-xs uppercase text-muted">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
          <h1>Good morning</h1>
          <p className="mt-1 text-muted">{all?.length ? `${all.length} things need you today, most urgent first.` : 'Nothing needs you. Everything is on track.'}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="?tab=all" className={tab === 'all' ? 'btn-dark' : 'btn'}>All {all?.length}</Link>
          <Link href="?tab=touch" className={tab === 'touch' ? 'btn-dark' : 'btn'}>Candidate touches {count('touch')}</Link>
          <Link href="?tab=stalled" className={tab === 'stalled' ? 'btn-dark' : 'btn'}>Stalled {count('stalled')}</Link>
          <Link href="?tab=client_feedback" className={tab === 'client_feedback' ? 'btn-dark' : 'btn'}>Client feedback {count('client_feedback')}</Link>
        </div>

        <div className="card divide-y divide-line">
          {rows.map((r) => (
            <div key={r.submission_id + r.kind} className="flex items-center gap-4 p-4">
              <div className="w-36 shrink-0">
                <span className={`chip ${r.kind === 'touch' ? 'text-bad' : r.kind === 'stalled' ? 'text-warn' : 'text-blue-800'}`}>{queueLabel(r.kind, Number(r.hours), Number(r.overdue_hours))}</span>
                <div className="mt-1 text-xs text-muted">{queueGroup(r.kind)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/candidates/${r.candidate_id}`} className="font-medium">{r.candidate_name}</Link>
                <span className="ml-2 text-sm text-muted">{r.req_title} · {r.client_name}</span>
                <p className="text-sm">{r.kind === 'client_feedback' ? `Waiting on client at ${r.detail}.` : r.detail}</p>
              </div>
              <div className="flex gap-2">
                {r.kind === 'touch' && <><form action={snooze.bind(null, r.submission_id)}><button className="btn">Snooze</button></form>
                  <form action={touchDone.bind(null, r.submission_id)}><button className="btn-dark">Done</button></form></>}
                {r.kind === 'client_feedback' && <form action={nudgeClient.bind(null, r.submission_id)}><button className="btn-dark">Nudge client</button></form>}
                {r.kind === 'stalled' && <Link href={`/reqs/${r.req_id}`} className="btn-dark">Open</Link>}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">Ranked by SLA breach. Items clear themselves when the underlying record moves.</p>
      </div>

      <aside className="space-y-4">
        {pendingSets?.map((c: any) => (
          <div key={c.id} className="card space-y-2 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">{c.status === 'changes_requested' ? 'Criteria: changes requested' : 'Criteria awaiting approval'}</div>
            <div className="font-medium">{c.reqs.title} · {c.reqs.clients.name}</div>
            <p className="text-sm text-muted">{c.status === 'changes_requested' ? `${c.reqs.contacts?.name ?? 'The hiring manager'} asked for changes. You can't submit candidates until the criteria are approved.` : `Waiting on ${c.reqs.contacts?.name ?? 'the hiring manager'}. You can't submit candidates until they approve.`}</p>
            <div className="flex gap-2">
              <Link href={`/reqs/${c.req_id}/criteria`} className="btn-dark">Open</Link>
              {c.status === 'pending_approval' && <form action={resendCriteriaLink.bind(null, c.req_id)}><button className="btn">Resend link</button></form>}
            </div>
          </div>
        ))}
        {closing.filter((r) => r.open > 0).map((r) => (
          <div key={r.id} className="card space-y-2 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-warn">Closure required</div>
            <div className="font-medium">{r.title} · {r.clients.name}</div>
            <p className="text-sm text-muted">{r.open} applicants still need a disposition before this req can close.</p>
            <Link href={`/reqs/${r.id}/close`} className="btn-dark w-full justify-center">Review &amp; send {r.open} messages</Link>
          </div>
        ))}
      </aside>
    </div>
  )
}

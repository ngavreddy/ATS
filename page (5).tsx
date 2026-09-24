import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { fit } from '@/lib/filters'
import { fmt } from '@/lib/dates'
import { addNote } from '../actions'

export default async function CandidatePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; scope?: string }>
}) {
  const { id } = await params
  const { error, scope = 'all' } = await searchParams
  const sb = await supabaseServer()

  const { data: c } = await sb.from('candidates').select('*').eq('id', id).single()
  const { data: subs } = await sb.from('submissions')
    .select('id, stage_index, stage_name, status, outcome, introduced_at, reqs(id, title, client_id, workflow, clients(name))')
    .eq('candidate_id', id).order('created_at', { ascending: false })
  const { data: liveReqs } = await sb.from('reqs').select('id, title, client_id, pay_min, pay_max, work_model, clients(name)').eq('status', 'live')

  let nq = sb.from('notes').select('*, submissions(reqs(title, clients(name)))').eq('candidate_id', id).order('created_at', { ascending: false })
  if (scope === 'general') nq = nq.is('submission_id', null)
  else if (scope !== 'all') nq = nq.eq('submission_id', scope)
  const { data: notes } = await nq

  const { data: approvedSets } = await sb.from('req_criteria_sets').select('req_id').eq('status', 'approved')
  const approvedReqIds = new Set(approvedSets?.map((x: any) => x.req_id))

  const p = c.prefs ?? {}
  const submittedReqIds = new Set(subs?.map((s) => s.reqs.id))

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <div>
          <Link href="/candidates" className="text-sm text-muted">Candidates /</Link>
          <h1>{c.full_name}</h1>
          <p className="text-muted">{c.headline} · {c.metro}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {c.open_to_match && <span className="chip">Open to be matched</span>}
            <a className="chip" href={`/status/${c.status_token}`} target="_blank">Candidate status page</a>
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error}</p>}

        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Submissions · {subs?.filter((s) => s.status === 'active').length} active. Select one to scope the timeline</h2>
          {subs?.map((s) => (
            <Link key={s.id} href={`?scope=${s.id}`} className={`card block p-4 ${s.status === 'closed' ? 'opacity-60' : ''}`}>
              <div className="flex justify-between"><div>
                <div className="font-medium">{s.reqs.title}</div><div className="text-sm text-muted">{s.reqs.clients.name}</div></div>
                <span className="chip self-start">{s.status === 'closed' ? `Closed · ${s.outcome}` : s.stage_name}</span></div>
              <div className="mt-3 flex gap-1">
                {s.reqs.workflow.map((st: any, i: number) => (
                  <div key={i} className="flex-1"><div className={`h-1 rounded ${i <= s.stage_index ? 'bg-ink' : 'bg-stone-200'}`} />
                    <div className="mt-1 text-[11px] text-muted">{st.name}</div></div>
                ))}
              </div>
            </Link>
          ))}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Hard filters</h2>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-muted">Comp floor</dt><dd>{p.comp_floor ? `$${p.comp_floor / 1000}k base` : '—'}</dd></div>
            <div><dt className="text-muted">Work model</dt><dd>{p.work_models?.join(', ') || '—'}</dd></div>
            <div><dt className="text-muted">Dealbreakers</dt><dd>{p.dealbreakers?.join(', ') || '—'}</dd></div>
          </dl>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Submit to a req. Only reqs that fit the hard filters and have approved criteria can be picked</h2>
          {liveReqs?.map((r) => {
            const f = fit(p, r)
            const already = submittedReqIds.has(r.id)
            const hasCriteria = approvedReqIds.has(r.id)
            const known = subs?.find((s) => s.reqs.client_id === r.client_id)
            const blocked = !f.ok ? f.reasons.join(', ') : already ? 'Already submitted' : !hasCriteria ? 'Criteria not approved yet' : null
            return (
              <div key={r.id} className={`flex items-start gap-3 rounded-lg border border-line p-3 ${blocked ? 'opacity-60' : ''}`}>
                <div className="flex-1">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-sm text-muted">{r.clients.name} · ${r.pay_min / 1000}–{r.pay_max / 1000}k</div>
                  {known && !already && <div className="mt-1 text-xs text-blue-800">{r.clients.name} already knows {c.full_name.split(' ')[0]}: introduced {fmt(known.introduced_at)}. Covered by the non-circumvention term.</div>}
                </div>
                {blocked ? <span className="chip">{blocked}</span> : <Link href={`/candidates/${id}/submit/${r.id}`} className="btn-dark">Assess &amp; submit</Link>}
              </div>
            )
          })}
        </section>
      </div>

      <aside className="card h-fit space-y-4 p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Activity</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="?scope=all" className={scope === 'all' ? 'btn-dark' : 'btn'}>All</Link>
          <Link href="?scope=general" className={scope === 'general' ? 'btn-dark' : 'btn'}>General</Link>
          {subs?.map((s) => <Link key={s.id} href={`?scope=${s.id}`} className={scope === s.id ? 'btn-dark' : 'btn'}>{s.reqs.clients.name}</Link>)}
        </div>
        <form action={addNote} className="space-y-2">
          <input type="hidden" name="candidate_id" value={id} />
          <div className="flex gap-2">
            <select name="scope" defaultValue={scope !== 'all' ? scope : 'general'} className="input">
              <option value="general">General</option>
              {subs?.map((s) => <option key={s.id} value={s.id}>{s.reqs.clients.name} · {s.reqs.title}</option>)}
            </select>
            <select name="kind" className="input w-28"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option></select>
          </div>
          <textarea name="body" required rows={3} placeholder="Log a note, call or email…" className="input" />
          <button className="btn-dark">Add</button>
        </form>
        <ul className="divide-y divide-line">
          {notes?.map((n) => (
            <li key={n.id} className="py-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium capitalize">{n.kind}</span>
                <span className="chip">{n.submissions ? n.submissions.reqs.clients.name : 'General'}</span>
                {n.ai_generated && <span className="chip">AI notes · reviewed</span>}
              </div>
              <p className="whitespace-pre-wrap">{n.body}</p>
              <div className="mt-1 text-xs text-muted">{new Date(n.created_at).toLocaleString('en-US')}</div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

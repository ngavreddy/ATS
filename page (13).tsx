import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { freshness } from '@/lib/workflow'
import { daysBetween, today } from '@/lib/dates'

export default async function Reqs() {
  const sb = await supabaseServer()
  const { data: reqs } = await sb.from('reqs')
    .select('id, title, status, pay_min, pay_max, workflow, created_at, clients(name), submissions(stage_index, status)')
    .neq('status', 'closed').order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div><h1>Reqs</h1><p className="mt-1 text-muted">{reqs?.length ?? 0} open across your clients.</p></div>
        <Link href="/reqs/new" className="btn-dark">New req</Link>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr><th className="p-3">Req</th><th>Pay range</th><th>Review</th><th>Interview</th><th>Offer</th><th>Freshness</th><th>Open</th></tr>
          </thead>
          <tbody>
            {reqs?.map((r) => {
              const active = r.submissions.filter((s: any) => s.status === 'active')
              const last = r.workflow.length - 1
              const cnt = (f: (i: number) => boolean) => active.filter((s: any) => f(s.stage_index)).length
              return (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-stone-50">
                  <td className="p-3"><Link href={`/reqs/${r.id}`} className="font-medium">{r.title}</Link>
                    <div className="text-muted">{r.clients.name}</div></td>
                  <td>{r.pay_min ? `$${r.pay_min / 1000}–${r.pay_max / 1000}k` : <span className="chip text-bad">Missing</span>}</td>
                  <td>{cnt((i) => i < 2)}</td><td>{cnt((i) => i >= 2 && i < last)}</td><td>{cnt((i) => i === last)}</td>
                  <td><span className="chip">{freshness(r.status, r.workflow, r.submissions)}</span></td>
                  <td>{daysBetween(r.created_at.slice(0, 10), today())}d</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Only reqs with a pay range and benefits can be published. Candidates see freshness exactly as shown here.</p>
    </div>
  )
}

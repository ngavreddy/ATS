import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { daysBetween, fmt, today } from '@/lib/dates'

export default async function Placements() {
  const sb = await supabaseServer()
  const { data } = await sb.from('placements')
    .select('id, base_salary, fee_amount, start_date, guarantee_end, status, submissions(candidates(full_name), reqs(title, clients(name)))')
    .order('start_date', { ascending: false })
  return (
    <div className="space-y-6">
      <h1>Placements</h1>
      <div className="card divide-y divide-line">
        {data?.length === 0 && <p className="p-4 text-sm text-muted">None yet. Record one from a req when a candidate reaches Offer.</p>}
        {data?.map((p) => {
          const left = daysBetween(today(), p.guarantee_end)
          return (
            <Link key={p.id} href={`/placements/${p.id}`} className="flex justify-between p-4 hover:bg-stone-50">
              <div><div className="font-medium">{p.submissions.candidates.full_name}</div>
                <div className="text-sm text-muted">{p.submissions.reqs.title} · {p.submissions.reqs.clients.name} · starts {fmt(p.start_date)}</div></div>
              <div className="text-right"><div className="font-mono">${Number(p.fee_amount).toLocaleString()}</div>
                <div className="text-xs text-muted">{p.status === 'fell_off' ? 'Fell off' : left > 0 ? `Guarantee ends in ${left}d` : 'Guarantee complete'}</div></div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

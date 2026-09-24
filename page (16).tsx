import { supabaseServer } from '@/lib/supabase/server'
import { fmt } from '@/lib/dates'
import { guaranteeMilestones } from '@/lib/fees'
import { approveInvoice, recordFalloff } from '../actions'

export default async function PlacementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await supabaseServer()
  const { data: p } = await sb.from('placements')
    .select('*, msas(fee_pct), submissions(candidates(full_name), reqs(title, clients(name))), invoices(*)').eq('id', id).single()
  const inv = p.invoices[0]
  const steps = guaranteeMilestones(p.start_date, p.guarantee_end)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div><h1>{p.submissions.candidates.full_name}</h1>
            <p className="mt-1 text-muted">{p.submissions.reqs.title} · {p.submissions.reqs.clients.name} · {p.status === 'fell_off' ? 'Fell off' : 'Active'}</p></div>
          {p.status === 'active' && <form action={recordFalloff.bind(null, id)}><button className="btn">Record falloff</button></form>}
        </div>
        <div className="card p-5">
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-muted">Type</dt><dd>{p.type}</dd></div>
            <div><dt className="text-muted">Base salary</dt><dd>${p.base_salary.toLocaleString()}</dd></div>
            <div><dt className="text-muted">Start date</dt><dd>{fmt(p.start_date)}</dd></div>
            <div><dt className="text-muted">Fee</dt><dd>{p.fee_pct}% of base</dd></div>
            <div><dt className="text-muted">Guarantee</dt><dd>{p.guarantee_days} days · to {fmt(p.guarantee_end)}</dd></div>
            <div><dt className="text-muted">Payment terms</dt><dd>Net {p.payment_terms_days} from start</dd></div>
          </dl>
          <div className="mt-4 flex items-baseline justify-between rounded-lg bg-stone-50 p-4">
            <span className="font-mono text-sm text-muted">${p.base_salary.toLocaleString()} × {p.fee_pct}%</span>
            <span className="font-serif text-3xl">${Number(p.fee_amount).toLocaleString()}</span></div>
        </div>
        <div className="card p-5">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted">Guarantee</h2>
          <div className="flex justify-between">{steps.map(([l, d]) => <div key={l} className="text-center text-xs"><div className="font-medium">{l}</div><div className="text-muted">{fmt(d)}</div></div>)}</div>
        </div>
      </div>
      <aside className="card h-fit space-y-3 p-5">
        <div className="flex items-center justify-between"><h2 className="font-serif text-2xl">Invoice draft</h2><span className="chip">{inv.status}</span></div>
        <p className="text-sm text-muted">Bill to {p.submissions.reqs.clients.name} · Issue {fmt(inv.issue_date)} · Due {fmt(inv.due_date)}</p>
        <div className="flex justify-between border-t border-line pt-3 font-medium"><span>Total due</span><span className="font-mono">${Number(inv.amount).toLocaleString()}.00</span></div>
        {inv.status === 'draft' && <form action={approveInvoice.bind(null, inv.id, id)}><button className="btn-dark w-full justify-center">Approve</button></form>}
        <p className="text-xs text-muted">QuickBooks/Xero sync is not wired up yet. See "What's next."</p>
      </aside>
    </div>
  )
}

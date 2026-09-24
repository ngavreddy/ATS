import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { DEFAULT_STAGES } from '@/lib/workflow'
import { daysBetween, today } from '@/lib/dates'

async function addClient(fd: FormData) {
  'use server'
  const sb = await supabaseServer()
  const n = (k: string) => Number(fd.get(k))
  const { data: client, error } = await sb.from('clients').insert({ name: fd.get('name') }).select('id').single()
  if (error) throw new Error(error.message)
  await sb.from('contacts').insert({
    client_id: client.id, name: fd.get('hm_name'), email: fd.get('hm_email'), title: 'Hiring manager',
  })
  await sb.from('msas').insert({
    client_id: client.id, fee_pct: n('fee_pct'), guarantee_days: n('guarantee_days'),
    payment_terms_days: n('terms'), noncirc_months: n('noncirc'),
    renewal_date: fd.get('renewal') || null, signed_on: today(),
  })
  await sb.from('workflow_templates').insert({ client_id: client.id, stages: DEFAULT_STAGES })
  revalidatePath('/clients')
}

export default async function Clients() {
  const sb = await supabaseServer()
  const { data: clients } = await sb
    .from('clients')
    .select('id, name, msas(fee_pct, guarantee_days, payment_terms_days, noncirc_months, renewal_date), contacts(name, email)')
    .order('name')

  return (
    <div className="space-y-8">
      <div><h1>Contracts</h1>
        <p className="mt-1 text-muted">The terms here set every fee, guarantee and invoice.</p></div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr><th className="p-3">Client</th><th>Fee</th><th>Guarantee</th><th>Payment</th><th>Non-circ</th><th>Hiring manager</th><th>Renewal</th></tr>
          </thead>
          <tbody>
            {clients?.map((c) => {
              const m = c.msas?.[0]
              const left = m?.renewal_date ? daysBetween(today(), m.renewal_date) : null
              return (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td>{m?.fee_pct}%</td><td>{m?.guarantee_days}d</td><td>Net {m?.payment_terms_days}</td>
                  <td>{m?.noncirc_months} mo</td>
                  <td>{c.contacts?.[0]?.name}</td>
                  <td className={left !== null && left <= 60 ? 'text-warn' : ''}>
                    {left === null ? '—' : left <= 60 ? `Renews in ${left} days` : m.renewal_date}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <form action={addClient} className="card grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
        <h2 className="col-span-full font-medium">Add client</h2>
        <div><label className="label">Client name</label><input name="name" required className="input" /></div>
        <div><label className="label">Hiring manager</label><input name="hm_name" required className="input" /></div>
        <div className="col-span-2"><label className="label">HM email</label><input name="hm_email" type="email" required className="input" /></div>
        <div><label className="label">Fee %</label><input name="fee_pct" type="number" step="0.5" defaultValue={20} className="input" /></div>
        <div><label className="label">Guarantee days</label><input name="guarantee_days" type="number" defaultValue={90} className="input" /></div>
        <div><label className="label">Net terms (days)</label><input name="terms" type="number" defaultValue={30} className="input" /></div>
        <div><label className="label">Non-circ (months)</label><input name="noncirc" type="number" defaultValue={12} className="input" /></div>
        <div><label className="label">Renewal date</label><input name="renewal" type="date" className="input" /></div>
        <div className="col-span-full"><button className="btn-dark">Save client and MSA</button></div>
      </form>
    </div>
  )
}

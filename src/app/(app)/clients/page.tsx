import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { daysBetween, today } from '@/lib/dates'
import { CLIENT_STATUS } from '@/lib/contacts'

const OPEN = ['draft', 'live', 'on_hold']

export default async function Clients({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; error?: string }> }) {
  const { status = '', q = '', error } = await searchParams
  const sb = await supabaseServer()
  let query = sb.from('clients')
    .select('id, name, status, industry, city, state, contacts(name, role, status, is_primary), msas(status, fee_pct, guarantee_days, renewal_date), reqs(status)')
    .order('name')
  if (CLIENT_STATUS.some(([k]) => k === status)) query = query.eq('status', status)
  const term = q.replace(/[%_\\,()]/g, '').trim()
  if (term) query = query.ilike('name', `%${term}%`)
  const { data: clients, error: loadError } = await query

  const tabs: [string, string][] = [['', 'All'], ...CLIENT_STATUS]
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div><h1>Clients</h1><p className="mt-1 text-muted">Companies you work with, the people at each one, and the contract terms that set every fee.</p></div>
        <Link href="/clients/new" className="btn-dark">Add client</Link>
      </div>
      {(error || loadError) && <p className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error ?? loadError?.message}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/clients?${new URLSearchParams({ ...(k ? { status: k } : {}), ...(term ? { q: term } : {}) })}`}
            className={`chip ${status === k ? 'bg-ink text-white' : ''}`}>{l}</Link>
        ))}
        <form className="ml-auto flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={term} placeholder="Search clients" className="input w-56" />
          <button className="btn">Search</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr><th className="p-3">Client</th><th>Status</th><th>Main contact</th><th>Hiring managers</th><th>Open reqs</th><th>Fee</th><th>Guarantee</th><th>Renewal</th></tr>
          </thead>
          <tbody>
            {clients?.map((c: any) => {
              const m = c.msas?.find((x: any) => x.status === 'active')
              const active = (c.contacts ?? []).filter((p: any) => p.status === 'active')
              const left = m?.renewal_date ? daysBetween(today(), m.renewal_date) : null
              return (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="p-3"><Link href={`/clients/${c.id}`} className="font-medium underline-offset-2 hover:underline">{c.name}</Link>
                    <div className="text-xs text-muted">{[c.industry, c.city && c.state ? `${c.city}, ${c.state}` : c.city || c.state].filter(Boolean).join(' · ')}</div></td>
                  <td><span className="chip capitalize">{c.status}</span></td>
                  <td>{active.find((p: any) => p.is_primary)?.name ?? <span className="text-muted">—</span>}</td>
                  <td>{active.filter((p: any) => p.role === 'hiring_manager').length}</td>
                  <td>{c.reqs?.filter((r: any) => OPEN.includes(r.status)).length ?? 0}</td>
                  <td>{m ? `${m.fee_pct}%` : <span className="text-muted">No contract</span>}</td>
                  <td>{m ? `${m.guarantee_days}d` : '—'}</td>
                  <td className={left !== null && left <= 60 ? 'text-warn' : ''}>{left === null ? '—' : left <= 60 ? `Renews in ${left} days` : m.renewal_date}</td>
                </tr>
              )
            })}
            {!clients?.length && <tr><td colSpan={8} className="p-6 text-center text-muted">{term || status ? 'No clients match.' : 'No clients yet. Add your first one.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

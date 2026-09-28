import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { daysBetween, today } from '@/lib/dates'
import { CLIENT_STATUS, CONTACT_ROLES, ROLE_LABEL } from '@/lib/contacts'
import { US_STATES } from '@/lib/us-states'
import { addClientNote, addContact, makePrimary, replaceContract, setContactStatus, updateClient, updateContact } from '../actions'

const Hidden = ({ id, contact }: { id: string; contact?: string }) => (
  <><input type="hidden" name="client_id" value={id} />{contact && <input type="hidden" name="contact_id" value={contact} />}</>
)
const Field = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={className}><label className="label">{label}</label>{children}</div>
)
const roleSelect = (name: string, value: string) => (
  <select name={name} defaultValue={value} className="input">{CONTACT_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
)

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const { error } = await searchParams
  const sb = await supabaseServer()
  const { data: c } = await sb.from('clients')
    .select('*, contacts(*), msas(*), reqs(id, title, status, pay_min, pay_max, created_at), client_notes(id, body, created_at, contact_id)')
    .eq('id', id).maybeSingle()
  if (!c) notFound()

  const people = [...(c.contacts ?? [])].sort((a: any, b: any) =>
    Number(b.is_primary) - Number(a.is_primary) || Number(b.status === 'active') - Number(a.status === 'active') || a.name.localeCompare(b.name))
  const activePeople = people.filter((p: any) => p.status === 'active')
  const msa = c.msas?.find((m: any) => m.status === 'active')
  const past = (c.msas ?? []).filter((m: any) => m.status !== 'active').length
  const left = msa?.renewal_date ? daysBetween(today(), msa.renewal_date) : null
  const reqs = [...(c.reqs ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
  const notes = [...(c.client_notes ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
  const nameOf = (cid: string | null) => people.find((p: any) => p.id === cid)?.name

  return (
    <div className="space-y-8">
      <div>
        <Link href="/clients" className="text-sm text-muted">Clients /</Link>
        <div className="flex items-start justify-between">
          <div>
            <h1>{c.name} <span className="chip align-middle text-sm capitalize">{c.status}</span></h1>
            <p className="mt-1 text-muted">
              {[c.industry, c.city && c.state ? `${c.city}, ${c.state}` : c.city || c.state].filter(Boolean).join(' · ')}
              {c.website && <> {c.industry || c.city ? '· ' : ''}<a href={c.website} target="_blank" rel="noreferrer" className="underline">{c.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></>}
            </p>
          </div>
          <Link href={`/reqs/new?client=${c.id}`} className="btn-dark">New req for {c.name}</Link>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted">Edit company details</summary>
          <form action={updateClient} className="card mt-3 grid grid-cols-2 gap-4 p-4 md:grid-cols-3">
            <Hidden id={c.id} />
            <Field label="Client name" className="col-span-2 md:col-span-1"><input name="name" required defaultValue={c.name} className="input" /></Field>
            <Field label="Status"><select name="status" defaultValue={c.status} className="input">{CLIENT_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Industry"><input name="industry" defaultValue={c.industry ?? ''} className="input" /></Field>
            <Field label="Website"><input name="website" defaultValue={c.website ?? ''} className="input" /></Field>
            <Field label="City"><input name="city" defaultValue={c.city ?? ''} className="input" /></Field>
            <Field label="State"><select name="state" defaultValue={c.state ?? ''} className="input"><option value="">—</option>{US_STATES.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select></Field>
            <div className="col-span-full"><button className="btn-dark">Save details</button></div>
          </form>
        </details>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">People at {c.name} · {activePeople.length} active</h2>
        {!people.length && <p className="card p-4 text-sm text-muted">No contacts yet. Add the hiring manager below, and you can pick them when you create a req.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {people.map((p: any) => (
            <div key={p.id} className={`card space-y-2 p-4 ${p.status === 'inactive' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.name}</span>
                {p.is_primary && <span className="chip bg-ink text-white">Main contact</span>}
                <span className="chip">{ROLE_LABEL[p.role] ?? p.role}</span>
                {p.status === 'inactive' && <span className="chip text-bad">Left / inactive</span>}
              </div>
              <div className="text-sm text-muted">{[p.title, p.email, p.phone].filter(Boolean).join(' · ') || 'No details yet'}</div>
              {p.notes && <div className="text-sm">{p.notes}</div>}
              <div className="flex flex-wrap gap-2">
                {p.status === 'active' && !p.is_primary && <form action={makePrimary}><Hidden id={c.id} contact={p.id} /><button className="btn">Make main contact</button></form>}
                <form action={setContactStatus}><Hidden id={c.id} contact={p.id} /><input type="hidden" name="status" value={p.status === 'active' ? 'inactive' : 'active'} />
                  <button className="btn">{p.status === 'active' ? 'Mark as left' : 'Reactivate'}</button></form>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-muted">Edit</summary>
                <form action={updateContact} className="mt-2 grid grid-cols-2 gap-3">
                  <Hidden id={c.id} contact={p.id} />
                  <Field label="Name"><input name="name" required defaultValue={p.name} className="input" /></Field>
                  <Field label="Role">{roleSelect('role', p.role)}</Field>
                  <Field label="Email"><input name="email" type="email" defaultValue={p.email ?? ''} className="input" /></Field>
                  <Field label="Phone"><input name="phone" defaultValue={p.phone ?? ''} className="input" /></Field>
                  <Field label="Job title" className="col-span-2"><input name="title" defaultValue={p.title ?? ''} className="input" /></Field>
                  <Field label="Notes" className="col-span-2"><input name="notes" defaultValue={p.notes ?? ''} className="input" /></Field>
                  <div className="col-span-2"><button className="btn-dark">Save</button></div>
                </form>
              </details>
            </div>
          ))}
        </div>
        <details className="card p-4" open={!people.length}>
          <summary className="cursor-pointer text-sm font-medium">Add a person</summary>
          <form action={addContact} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Hidden id={c.id} />
            <Field label="Name *"><input name="name" required className="input" /></Field>
            <Field label="Role">{roleSelect('role', 'hiring_manager')}</Field>
            <Field label="Job title"><input name="title" className="input" /></Field>
            <Field label="Email"><input name="email" type="email" className="input" /></Field>
            <Field label="Phone"><input name="phone" className="input" /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="primary" /> Main contact</label>
            <div className="col-span-full"><button className="btn-dark">Add person</button></div>
          </form>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Contract terms</h2>
        <div className="card p-4">
          {msa ? (
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
              <div><div className="label">Fee</div>{msa.fee_pct}%</div>
              <div><div className="label">Guarantee</div>{msa.guarantee_days} days</div>
              <div><div className="label">Payment</div>Net {msa.payment_terms_days}</div>
              <div><div className="label">Non-circ</div>{msa.noncirc_months} months</div>
              <div className={left !== null && left <= 60 ? 'text-warn' : ''}><div className="label">Renewal</div>{left === null ? '—' : left <= 60 ? `Renews in ${left} days` : msa.renewal_date}</div>
            </div>
          ) : <p className="text-sm text-muted">No contract on file yet. Add one before recording a placement for this client.</p>}
        </div>
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-medium">{msa ? 'Replace contract terms' : 'Add contract terms'}</summary>
          <p className="mt-2 text-xs text-muted">{msa ? 'The current terms are kept on file. Placements already made keep the terms they were made under' + (past ? ` (${past} earlier version${past > 1 ? 's' : ''} on file).` : '.') : ''}</p>
          <form action={replaceContract} className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Hidden id={c.id} />
            <Field label="Fee %"><input name="fee_pct" inputMode="decimal" defaultValue={msa?.fee_pct ?? 20} className="input" /></Field>
            <Field label="Guarantee days"><input name="guarantee_days" inputMode="numeric" defaultValue={msa?.guarantee_days ?? 90} className="input" /></Field>
            <Field label="Net terms"><input name="terms" inputMode="numeric" defaultValue={msa?.payment_terms_days ?? 30} className="input" /></Field>
            <Field label="Non-circ (months)"><input name="noncirc" inputMode="numeric" defaultValue={msa?.noncirc_months ?? 12} className="input" /></Field>
            <Field label="Renewal date"><input name="renewal" type="date" defaultValue={msa?.renewal_date ?? ''} className="input" /></Field>
            <div className="col-span-full"><button className="btn-dark">Save contract terms</button></div>
          </form>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Reqs · {reqs.length}</h2>
        {!reqs.length && <p className="card p-4 text-sm text-muted">No reqs for this client yet.</p>}
        {reqs.map((r: any) => (
          <Link key={r.id} href={`/reqs/${r.id}`} className="card flex items-center justify-between p-3 text-sm hover:bg-stone-50">
            <span className="font-medium">{r.title}</span>
            <span className="flex items-center gap-3 text-muted">{r.pay_min ? `$${r.pay_min / 1000}–${r.pay_max / 1000}k` : 'No pay range'}<span className="chip capitalize">{r.status}</span></span>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Notes</h2>
        <form action={addClientNote} className="card space-y-3 p-4">
          <Hidden id={c.id} />
          <textarea name="body" rows={2} required placeholder="Called Dana. She wants two more data engineers in Q4." className="input" />
          <div className="flex items-center gap-3">
            <select name="contact_id" className="input w-64"><option value="">About the company in general</option>{activePeople.map((p: any) => <option key={p.id} value={p.id}>About {p.name}</option>)}</select>
            <button className="btn">Add note</button>
          </div>
        </form>
        {notes.map((n: any) => (
          <div key={n.id} className="card p-4 text-sm">
            <div className="mb-1 text-xs text-muted">{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{nameOf(n.contact_id) && ` · about ${nameOf(n.contact_id)}`}</div>
            <div className="whitespace-pre-wrap">{n.body}</div>
          </div>
        ))}
      </section>
    </div>
  )
}

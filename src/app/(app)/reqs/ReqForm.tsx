'use client'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import BenefitsFields from './BenefitsFields'
import { defaultManager, hiringManagersFor, type Contact } from '@/lib/contacts'
import { PLACEMENT_TYPES, WORK_MODEL_OPTIONS } from '@/lib/req-form'
import { one, type FormState } from '@/lib/form-state'
import type { Benefits } from '@/lib/benefits'

type Props = {
  action: (prev: FormState, fd: FormData) => Promise<FormState>
  clients: { id: string; name: string }[]
  contacts: Contact[]
  initial: Record<string, string>          // starting values, keyed by field name
  benefits?: Benefits
  reqId?: string                            // set when editing
  status?: string                           // draft | live | on_hold when editing
}

const Field = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={className}><label className="label">{label}</label>{children}</div>
)

export default function ReqForm({ action, clients, contacts, initial, benefits, reqId, status }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as FormState)
  const v = state.values ?? initial
  const d = (k: string) => one(v[k])
  const editing = !!reqId

  const [clientId, setClientId] = useState(initial.client_id ?? '')
  const managers = hiringManagersFor(contacts, clientId)
  const [managerId, setManagerId] = useState(initial.hiring_manager_id ?? defaultManager(managers))
  const current = contacts.find((c) => c.id === managerId)
  const showCurrent = !!current && current.client_id === clientId && !managers.some((m) => m.id === current.id)   // someone who has since left
  const pickClient = (id: string) => { setClientId(id); setManagerId(defaultManager(hiringManagersFor(contacts, id))) }

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <h1>{editing ? 'Edit req' : 'New req'}</h1>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-bad">{state.error}</p>}
      {reqId && <input type="hidden" name="req_id" value={reqId} />}

      <div className="card grid grid-cols-2 gap-4 p-6">
        <h2 className="col-span-full text-xs font-medium uppercase tracking-wide text-muted">Role</h2>
        <Field label="Client *">
          {editing ? (
            <><input type="hidden" name="client_id" value={clientId} /><div className="input bg-stone-50">{clients.find((c) => c.id === clientId)?.name}</div></>
          ) : (
            <select name="client_id" required value={clientId} onChange={(e) => pickClient(e.target.value)} className="input">
              <option value="">Choose a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {!clients.length && <p className="mt-1 text-xs text-warn">No clients yet. <Link href="/clients/new" className="underline">Add a client</Link> first.</p>}
        </Field>
        <Field label="Hiring manager">
          <select name="hiring_manager_id" value={managerId} onChange={(e) => setManagerId(e.target.value)} disabled={!clientId} className="input">
            <option value="">{!clientId ? 'Choose a client first' : managers.length ? 'Choose a hiring manager…' : 'No hiring managers yet'}</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name}{m.title ? ` · ${m.title}` : ''}{m.is_primary ? ' (main contact)' : ''}</option>)}
            {showCurrent && <option value={current!.id}>{current!.name} (no longer active)</option>}
          </select>
          {clientId && !managers.length && <p className="mt-1 text-xs text-warn">This client has no active hiring managers. <Link href={`/clients/${clientId}`} className="underline">Add one on the client page</Link>. Only the chosen client&apos;s people appear here.</p>}
        </Field>
        <Field label="Title *" className="col-span-2"><input name="title" required defaultValue={d('title')} className="input" /></Field>
        <Field label="Location"><input name="location" defaultValue={d('location')} placeholder="Chicago, IL" className="input" /></Field>
        <Field label="Work model"><select key={`wm${state.nonce}`} name="work_model" defaultValue={d('work_model') || 'onsite'} className="input">{WORK_MODEL_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Placement type"><select key={`pt${state.nonce}`} name="placement_type" defaultValue={d('placement_type') || 'FTE'} className="input">{PLACEMENT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>

      <div className="card grid grid-cols-3 gap-4 border-red-200 p-6">
        <h2 className="col-span-full flex justify-between text-xs font-medium uppercase tracking-wide text-muted">
          Pay &amp; benefits <span className="chip text-bad">Required to publish</span></h2>
        <Field label="Base from"><input name="pay_min" inputMode="numeric" defaultValue={d('pay_min')} placeholder="135000" className="input" /></Field>
        <Field label="Base to"><input name="pay_max" inputMode="numeric" defaultValue={d('pay_max')} placeholder="155000" className="input" /></Field>
        <Field label="Bonus (optional)"><input name="bonus_note" defaultValue={d('bonus_note')} placeholder="10% target" className="input" /></Field>
        <BenefitsFields initial={benefits} initialOther={d('benefits_other')} />
        <p className="col-span-full text-xs text-muted">Illinois requires the pay scale and benefits on postings for Illinois-related roles, including agency postings. Every published version is archived for 5 years.</p>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Inputs for the evaluation criteria</h2>
        <p className="text-sm text-muted">Claude turns these into a draft scorecard that your hiring manager approves before anyone can be submitted.</p>
        <Field label="Job description"><textarea name="job_description" rows={5} defaultValue={d('job_description')} className="input" /></Field>
        <Field label="Intake brief (notes or transcript from the req call)"><textarea name="brief" rows={5} defaultValue={d('brief')} className="input" /></Field>
        <Field label="Must-haves you already know (one per line, optional)"><textarea name="must_haves" rows={3} defaultValue={d('must_haves')} className="input" /></Field>
      </div>

      <div className="flex gap-3">
        {(!editing || status === 'draft') && <button name="intent" value="publish" disabled={pending} className="btn-dark">{pending ? 'Saving…' : 'Publish req'}</button>}
        {(!editing || status === 'draft') && <button name="intent" value="draft" disabled={pending} className="btn">Save draft</button>}
        {editing && status !== 'draft' && <button name="intent" value="save" disabled={pending} className="btn-dark">{pending ? 'Saving…' : 'Save changes'}</button>}
        <Link href={reqId ? `/reqs/${reqId}` : '/reqs'} className="btn">Cancel</Link>
      </div>
    </form>
  )
}

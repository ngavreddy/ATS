'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { CLIENT_STATUS, CONTACT_ROLES } from '@/lib/contacts'
import { US_STATES } from '@/lib/us-states'
import { one, type FormState } from '@/lib/form-state'

const Field = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={className}><label className="label">{label}</label>{children}</div>
)

export default function ClientForm({ action }: { action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {} as FormState)
  const v = state.values ?? {}
  const d = (k: string, fallback = '') => one(v[k]) || fallback
  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <h1>New client</h1>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-bad">{state.error}</p>}
      <div key={state.nonce ?? 0} className="space-y-6">

      <div className="card grid grid-cols-2 gap-4 p-6">
        <h2 className="col-span-full text-xs font-medium uppercase tracking-wide text-muted">Company</h2>
        <Field label="Client name *" className="col-span-2"><input name="name" required defaultValue={d('name')} className="input" /></Field>
        <Field label="Status"><select name="status" defaultValue={d('status', 'active')} className="input">{CLIENT_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Industry"><input name="industry" defaultValue={d('industry')} placeholder="Logistics" className="input" /></Field>
        <Field label="Website"><input name="website" defaultValue={d('website')} placeholder="northwind.com" className="input" /></Field>
        <Field label="City"><input name="city" defaultValue={d('city')} className="input" /></Field>
        <Field label="State"><select name="state" defaultValue={d('state')} className="input"><option value="">—</option>{US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
      </div>

      <div className="card grid grid-cols-2 gap-4 p-6">
        <h2 className="col-span-full text-xs font-medium uppercase tracking-wide text-muted">First contact <span className="normal-case">(optional, you can add more people after saving)</span></h2>
        <Field label="Name"><input name="c_name" defaultValue={d('c_name')} className="input" /></Field>
        <Field label="Role"><select name="c_role" defaultValue={d('c_role', 'hiring_manager')} className="input">{CONTACT_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Email"><input name="c_email" type="email" defaultValue={d('c_email')} className="input" /></Field>
        <Field label="Phone"><input name="c_phone" defaultValue={d('c_phone')} className="input" /></Field>
        <Field label="Job title"><input name="c_title" defaultValue={d('c_title')} placeholder="VP, Data Platform" className="input" /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="c_primary" defaultChecked={state.values ? !!v.c_primary : true} /> Main contact for this client</label>
      </div>

      <div className="card grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
        <h2 className="col-span-full text-xs font-medium uppercase tracking-wide text-muted">Contract terms <span className="normal-case">(leave the fee blank if there is no contract yet, and set the status above to Prospect if they are not a client yet)</span></h2>
        <Field label="Fee %"><input name="fee_pct" inputMode="decimal" defaultValue={d('fee_pct', state.values ? '' : '20')} className="input" /></Field>
        <Field label="Guarantee days"><input name="guarantee_days" inputMode="numeric" defaultValue={d('guarantee_days', '90')} className="input" /></Field>
        <Field label="Net terms (days)"><input name="terms" inputMode="numeric" defaultValue={d('terms', '30')} className="input" /></Field>
        <Field label="Non-circ (months)"><input name="noncirc" inputMode="numeric" defaultValue={d('noncirc', '12')} className="input" /></Field>
        <Field label="Renewal date"><input name="renewal" type="date" defaultValue={d('renewal')} className="input" /></Field>
      </div>

      </div>
      <div className="flex gap-3">
        <button disabled={pending} className="btn-dark">{pending ? 'Saving…' : 'Save client'}</button>
        <Link href="/clients" className="btn">Cancel</Link>
      </div>
    </form>
  )
}

'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { NOTICE_PERIODS, SOURCES, WORK_AUTH, WORK_MODELS } from '@/lib/candidate'
import { US_STATES } from '@/lib/us-states'
import { many, one, type FormState, type FormValues } from '@/lib/form-state'

const Field = ({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <div className={className}><label className="label">{label}</label>{children}{hint && <p className="mt-1 text-xs text-muted">{hint}</p>}</div>
)
const Section = ({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) => (
  <div className="card grid grid-cols-2 gap-4 p-6 md:grid-cols-6">
    <h2 className="col-span-full text-xs font-medium uppercase tracking-wide text-muted">{title}{note && <span className="ml-2 normal-case">{note}</span>}</h2>
    {children}
  </div>
)

type Props = {
  action: (prev: FormState, fd: FormData) => Promise<FormState>
  initial: FormValues
  candidateId?: string
  resume?: { id: string; filename: string } | null
}

export default function CandidateForm({ action, initial, candidateId, resume }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as FormState)
  const v = state.values ?? initial
  const d = (k: string) => one(v[k])
  return (
    <form action={formAction} className="max-w-4xl space-y-6">
      <div key={state.nonce ?? 0} className="space-y-6">
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-bad">{state.error}{' '}
          {state.linkHref && <Link href={state.linkHref} className="font-medium underline">{state.linkText}</Link>}</p>
      )}
      {candidateId && <input type="hidden" name="candidate_id" value={candidateId} />}
      {resume && <input type="hidden" name="resume_upload_id" value={resume.id} />}

      <Section title="Who">
        <Field label="First name *" className="md:col-span-2"><input name="first_name" required defaultValue={d('first_name')} className="input" /></Field>
        <Field label="Last name *" className="md:col-span-2"><input name="last_name" required defaultValue={d('last_name')} className="input" /></Field>
        <Field label="Preferred name" hint="Optional. Used when we write to them." className="md:col-span-2"><input name="preferred_name" defaultValue={d('preferred_name')} className="input" /></Field>
        <Field label="Email" className="md:col-span-2"><input name="email" type="email" defaultValue={d('email')} className="input" /></Field>
        <Field label="Phone" className="md:col-span-2"><input name="phone" defaultValue={d('phone')} className="input" /></Field>
        <Field label="LinkedIn" className="md:col-span-2"><input name="linkedin_url" defaultValue={d('linkedin_url')} placeholder="linkedin.com/in/…" className="input" /></Field>
      </Section>

      <Section title="Address" note="City and state are required.">
        <Field label="Street address" className="col-span-2 md:col-span-6"><input name="address_line" defaultValue={d('address_line')} autoComplete="street-address" className="input" /></Field>
        <Field label="City *" className="col-span-2 md:col-span-3"><input name="city" required defaultValue={d('city')} className="input" /></Field>
        <Field label="State *" className="md:col-span-2">
          <select name="state" required defaultValue={d('state')} className="input"><option value="">Choose…</option>{US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
        <Field label="ZIP" className="md:col-span-1"><input name="postal_code" defaultValue={d('postal_code')} inputMode="numeric" className="input" /></Field>
        <p className="col-span-full text-xs text-muted">City and state power search and matching. The street address and ZIP are kept on file for your records only. They are never searched or used to score anyone.</p>
      </Section>

      <Section title="Current role">
        <Field label="Current title" className="md:col-span-3"><input name="current_title" defaultValue={d('current_title')} className="input" /></Field>
        <Field label="Current employer" className="md:col-span-3"><input name="current_employer" defaultValue={d('current_employer')} className="input" /></Field>
        <Field label="Years of experience" className="md:col-span-2"><input name="years_experience" inputMode="numeric" defaultValue={d('years_experience')} className="input" /></Field>
        <Field label="Skills" hint="Separate with commas. These are searchable." className="col-span-2 md:col-span-4"><input name="skills" defaultValue={d('skills')} placeholder="Spark, Python, SQL, Snowflake" className="input" /></Field>
      </Section>

      <Section title="What they want" note="Used to match them to reqs. A req that breaks one of these cannot be submitted.">
        <Field label="Minimum base salary" hint="Their floor, per year." className="md:col-span-2"><input name="comp_floor" inputMode="numeric" defaultValue={d('comp_floor')} placeholder="150000 or 150k" className="input" /></Field>
        <div className="md:col-span-2">
          <div className="label">Work models they accept</div>
          <div className="flex gap-4 pt-1 text-sm">{WORK_MODELS.map((m) => (
            <label key={m} className="flex items-center gap-1.5 capitalize"><input type="checkbox" name="work_models" value={m} defaultChecked={many(v.work_models).includes(m)} /> {m}</label>))}</div>
          <p className="mt-1 text-xs text-muted">Leave all unticked for no preference.</p>
        </div>
        <label className="flex items-center gap-2 self-center text-sm md:col-span-2"><input type="checkbox" name="willing_to_relocate" defaultChecked={['on', '1', 'true'].includes(d('willing_to_relocate'))} /> Willing to relocate</label>
        <Field label="Notice period" className="md:col-span-3"><select name="notice_period" defaultValue={d('notice_period')} className="input"><option value="">Not asked yet</option>{NOTICE_PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Work authorization" className="md:col-span-3"><select name="work_authorization" defaultValue={d('work_authorization')} className="input"><option value="">Not asked yet</option>{WORK_AUTH.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Target titles" hint="Roles they want next, separated with commas." className="col-span-2 md:col-span-3"><input name="target_titles" defaultValue={d('target_titles')} placeholder="Staff Data Engineer, Data Platform Lead" className="input" /></Field>
        <Field label="Dealbreakers" hint="Separated with commas." className="col-span-2 md:col-span-3"><input name="dealbreakers" defaultValue={d('dealbreakers')} placeholder="No relocation, no weekend on-call" className="input" /></Field>
      </Section>

      <Section title="Source">
        <Field label="Source" className="md:col-span-3"><select name="source" defaultValue={d('source')} className="input"><option value="">Not set</option>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Referred by" hint="Only used when the source is Referral." className="md:col-span-3"><input name="referred_by" defaultValue={d('referred_by')} className="input" /></Field>
      </Section>

      </div>
      <div className="flex gap-3">
        <button disabled={pending} className="btn-dark">{pending ? 'Saving…' : candidateId ? 'Save changes' : 'Save candidate'}</button>
        <Link href={candidateId ? `/candidates/${candidateId}` : '/candidates'} className="btn">Cancel</Link>
      </div>
    </form>
  )
}

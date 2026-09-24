import { supabaseServer } from '@/lib/supabase/server'
import { saveReq } from '../actions'
import Link from 'next/link'

export default async function NewReq({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const sb = await supabaseServer()
  const [{ data: clients }, { data: contacts }] = await Promise.all([
    sb.from('clients').select('id, name').order('name'),
    sb.from('contacts').select('id, name, clients(name)').order('name'),
  ])

  return (
    <form action={saveReq} className="max-w-3xl space-y-6">
      <h1>New req</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error}</p>}
      <div className="card grid grid-cols-2 gap-4 p-6">
        <h2 className="col-span-full text-xs font-medium uppercase tracking-wide text-muted">Role</h2>
        <div><label className="label">Client</label>
          <select name="client_id" required className="input">{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="label">Hiring manager</label>
          <select name="hiring_manager_id" className="input">{contacts?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.clients?.name}</option>)}</select></div>
        <div><label className="label">Title</label><input name="title" required className="input" /></div>
        <div><label className="label">Location</label><input name="location" className="input" /></div>
        <div><label className="label">Work model</label>
          <select name="work_model" className="input"><option value="onsite">Onsite</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></div>
        <div><label className="label">Placement type</label>
          <select name="placement_type" className="input"><option value="FTE">Full-time</option><option value="contract">Contract</option><option value="C2H">Contract-to-hire</option></select></div>
      </div>

      <div className="card grid grid-cols-3 gap-4 border-red-200 p-6">
        <h2 className="col-span-full flex justify-between text-xs font-medium uppercase tracking-wide text-muted">
          Pay &amp; benefits <span className="chip text-bad">Required to publish</span></h2>
        <div><label className="label">Base from</label><input name="pay_min" type="number" placeholder="135000" className="input" /></div>
        <div><label className="label">Base to</label><input name="pay_max" type="number" placeholder="155000" className="input" /></div>
        <div><label className="label">Bonus (optional)</label><input name="bonus_note" placeholder="10% target" className="input" /></div>
        <div className="col-span-full"><label className="label">Benefits summary</label>
          <textarea name="benefits_summary" rows={2} className="input" placeholder="Medical, dental and vision from day one; 401(k) with 6% match; 20 days PTO" /></div>
        <p className="col-span-full text-xs text-muted">Illinois requires the pay scale and benefits on postings for Illinois-related roles, including agency postings. Every published version is archived for 5 years.</p>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Inputs for the evaluation criteria</h2>
        <p className="text-sm text-muted">Claude turns these into a draft scorecard that your hiring manager approves before anyone can be submitted.</p>
        <div><label className="label">Job description</label><textarea name="job_description" rows={5} className="input" /></div>
        <div><label className="label">Intake brief (notes or transcript from the req call)</label><textarea name="brief" rows={5} className="input" /></div>
        <div><label className="label">Must-haves you already know (one per line, optional)</label><textarea name="must_haves" rows={3} className="input" /></div>
      </div>

      <div className="flex gap-3">
        <button name="intent" value="publish" className="btn-dark">Publish req</button>
        <button name="intent" value="draft" className="btn">Save draft</button>
        <Link href="/reqs" className="btn">Cancel</Link>
      </div>
    </form>
  )
}

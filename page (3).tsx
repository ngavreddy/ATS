import { addCandidate } from '../actions'

export default function NewCandidate() {
  return (
    <form action={addCandidate} className="card grid max-w-3xl grid-cols-2 gap-4 p-6">
      <h1 className="col-span-full">Add candidate</h1>
      <div><label className="label">Full name</label><input name="full_name" required className="input" /></div>
      <div><label className="label">Headline</label><input name="headline" placeholder="Senior Data Engineer at X · 8 yrs" className="input" /></div>
      <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
      <div><label className="label">Phone</label><input name="phone" className="input" /></div>
      <div><label className="label">Metro area</label><input name="metro" placeholder="Chicago metro" className="input" /></div>
      <div><label className="label">Source</label><input name="source" placeholder="referral" className="input" /></div>
      <h2 className="col-span-full mt-2 text-xs font-medium uppercase tracking-wide text-muted">Hard filters. Roles that break one are never shown or submitted</h2>
      <div><label className="label">Comp floor (base)</label><input name="comp_floor" type="number" className="input" /></div>
      <div><label className="label">Dealbreakers (comma separated)</label><input name="dealbreakers" placeholder="24/7 on-call, fully onsite" className="input" /></div>
      <fieldset className="col-span-full flex gap-4 text-sm">
        <span className="label mb-0 self-center">Acceptable work models</span>
        {['onsite', 'hybrid', 'remote'].map((m) => (
          <label key={m} className="flex items-center gap-1"><input type="checkbox" name="work_models" value={m} /> {m}</label>
        ))}
      </fieldset>
      <div className="col-span-full"><button className="btn-dark">Save</button></div>
    </form>
  )
}

import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { readSearch, SOURCE_LABEL, type SearchParams } from '@/lib/search'
import { US_STATES } from '@/lib/us-states'
import { explainDbError } from '@/lib/db-errors'
import { locationLabel } from '@/lib/names'
import { WORK_MODELS } from '@/lib/candidate'

export default async function Candidates({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { raw, args, errors, filtering } = readSearch(await searchParams)
  const sb = await supabaseServer()

  let rows: any[] = []
  let dbError: string | null = null
  if (!errors.length) {
    const { data, error } = await sb.rpc('search_candidates', args)
    if (error) dbError = explainDbError(error.message); else rows = data ?? []
  }
  const active = new Map<string, number>()
  if (rows.length) {
    const { data: subs } = await sb.from('submissions').select('candidate_id').eq('status', 'active').in('candidate_id', rows.map((r) => r.id))
    for (const s of subs ?? []) active.set(s.candidate_id, (active.get(s.candidate_id) ?? 0) + 1)
  }
  const anyFilter = raw.city || raw.state || raw.min || raw.max || raw.wm.length || raw.source || raw.relocate || raw.resume

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between"><h1>Candidates</h1><Link href="/candidates/new" className="btn-dark">Add candidate</Link></div>

      <form method="get" className="card space-y-3 p-4">
        <div className="flex gap-2">
          <input name="q" defaultValue={raw.q} placeholder={'"data engineer" AND (spark OR databricks) NOT intern'} aria-label="Search candidates" className="input" />
          <button className="btn-dark">Search</button>
          {filtering && <Link href="/candidates" className="btn">Clear</Link>}
        </div>
        <details open={!!anyFilter}>
          <summary className="cursor-pointer text-sm text-muted">Filters</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div><label className="label">City</label><input name="city" defaultValue={raw.city} className="input" /></div>
            <div><label className="label">State</label><select name="state" defaultValue={raw.state} className="input"><option value="">Any</option>{US_STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></div>
            <div><label className="label">Salary floor from</label><input name="min" defaultValue={raw.min} placeholder="150k" className="input" /></div>
            <div><label className="label">Salary floor to</label><input name="max" defaultValue={raw.max} placeholder="200k" className="input" /></div>
            <div><label className="label">Open to</label>
              <div className="flex gap-3 pt-1.5 text-sm">{WORK_MODELS.map((m) => <label key={m} className="flex items-center gap-1 capitalize"><input type="checkbox" name="wm" value={m} defaultChecked={raw.wm.includes(m)} />{m}</label>)}</div></div>
            <div><label className="label">Source</label><select name="source" defaultValue={raw.source} className="input"><option value="">Any</option>{Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="relocate" value="1" defaultChecked={raw.relocate} /> Willing to relocate</label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="resume" value="1" defaultChecked={raw.resume} /> Has a resume</label>
          </div>
          <p className="mt-2 text-xs text-muted">Salary floor is the least they will accept. To see who you can afford for a $160k role, leave &ldquo;from&rdquo; empty and put 160k in &ldquo;to&rdquo;.</p>
        </details>
        <details>
          <summary className="cursor-pointer text-sm text-muted">How to search</summary>
          <div className="mt-2 space-y-1 text-sm text-muted">
            <p>Searches names, titles, employers, skills, city and the full text of resumes.</p>
            <p><code>spark databricks</code> finds people with both. <code>spark OR databricks</code> finds either. <code>python NOT intern</code> or <code>python -intern</code> leaves out a word.</p>
            <p><code>&quot;data engineer&quot;</code> finds the exact phrase. <code>engineer*</code> also finds engineering. Use brackets to group: <code>(spark OR databricks) AND &quot;data engineer&quot;</code></p>
            <p>Symbols inside words are ignored, so <code>C++</code> searches for <code>C</code>. Street address and ZIP are never searched.</p>
          </div>
        </details>
      </form>

      {[...errors, ...(dbError ? [dbError] : [])].map((e) => <p key={e} role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-bad">{e}</p>)}

      {!errors.length && !dbError && (
        <p className="text-sm text-muted">{rows.length === 100 ? 'Showing the first 100. Narrow the search to see the rest.' : `${rows.length} candidate${rows.length === 1 ? '' : 's'}${filtering ? ' match' : ''}`}</p>
      )}
      <div className="space-y-2">
        {rows.map((c) => (
          <Link key={c.id} href={`/candidates/${c.id}`} className="card flex items-center justify-between p-4 hover:bg-stone-50">
            <div>
              <div className="font-medium">{c.first_name ? `${c.first_name}${c.preferred_name ? ` “${c.preferred_name}”` : ''} ${c.last_name ?? ''}` : c.full_name}</div>
              <div className="text-sm text-muted">{[c.headline, locationLabel(c)].filter(Boolean).join(' · ')}</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                {c.comp_floor ? <span className="chip">${Math.round(c.comp_floor / 1000)}k+</span> : null}
                {c.work_models?.map((m: string) => <span key={m} className="chip capitalize">{m}</span>)}
                {c.willing_to_relocate && <span className="chip">Relocate</span>}
                {c.source && <span className="chip">{SOURCE_LABEL[c.source] ?? c.source}</span>}
                {c.resume_path && <span className="chip">Resume</span>}
              </div>
            </div>
            <span className="text-sm text-muted">{active.get(c.id) ? `${active.get(c.id)} active` : ''}</span>
          </Link>
        ))}
        {!rows.length && !errors.length && !dbError && (
          <p className="card p-6 text-center text-muted">{filtering ? 'No candidates match. Try fewer filters or a broader search.' : 'No candidates yet. Add your first one.'}</p>
        )}
      </div>
    </div>
  )
}

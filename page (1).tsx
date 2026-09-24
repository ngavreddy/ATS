import { supabaseAdmin } from '@/lib/supabase/admin'
import { hashToken } from '@/lib/links'
import { assessmentSummary, LEVELS, STATUS_LABEL, type Criterion, type Ratings } from '@/lib/criteria'
import { approveCriteria, decide, requestCriteriaChanges, submitScorecard } from './actions'

const REASONS = ['Not enough relevant experience', 'Compensation mismatch', 'Location or work model', 'Better fit elsewhere', 'Other']
const ICON = { met: '✓', partial: '–', not_met: '✗', unknown: '?' } as const
const one = (x: any) => (Array.isArray(x) ? x[0] : x)

export default async function FeedbackPage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams
  const admin = supabaseAdmin()
  const { data: link } = await admin.from('feedback_links')
    .select('contact_id, contacts(name), agencies(name)')
    .eq('token_hash', hashToken(token)).gt('expires_at', new Date().toISOString()).maybeSingle()

  if (!link) return <div className="mx-auto mt-24 max-w-md p-6 text-center"><h1>Link expired</h1><p className="mt-2 text-muted">Ask your recruiter for a fresh link.</p></div>

  const cid = link.contact_id
  const [{ data: sets }, { data: cards }, { data: subs }] = await Promise.all([
    admin.from('req_criteria_sets').select('id, version, criteria, reqs!inner(title, hiring_manager_id)')
      .eq('status', 'pending_approval').eq('reqs.hiring_manager_id', cid),
    admin.from('scorecards')
      .select('id, stage_name, req_criteria_sets(criteria), submissions!inner(status, stage_name, candidates(full_name, headline), reqs(title))')
      .eq('contact_id', cid).is('submitted_at', null).eq('submissions.status', 'active'),
    admin.from('submissions')
      .select('id, stage_index, stage_name, candidates(full_name, headline, metro), reqs!inner(title, hiring_manager_id, workflow), submission_assessments(ratings, req_criteria_sets(criteria))')
      .eq('status', 'active').eq('reqs.hiring_manager_id', cid).order('created_at'),
  ])
  const openCards = (cards ?? []).filter((c: any) => c.stage_name === one(c.submissions).stage_name)
  // Candidates at a scorecard stage are handled by their scorecard, not a plain interview/pass
  const waiting = (subs ?? []).filter((s: any) => {
    const st = s.reqs.workflow[s.stage_index]
    return st?.waits_on === 'client' && !st?.scorecard
  })
  const total = (sets?.length ?? 0) + openCards.length + waiting.length
  const contact = one(link.contacts) as any

  return (
    <div className="mx-auto max-w-md space-y-6 p-5">
      <div><p className="text-sm text-muted">Hi {contact.name.split(' ')[0]},</p>
        <h1 className="mt-1 text-3xl">{total ? `${total} thing${total > 1 ? 's' : ''} for you` : 'All caught up'}</h1>
        <p className="mt-1 text-sm text-muted">No login needed. Each takes about a minute.</p></div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-bad">{error}</p>}

      {sets?.map((s: any) => {
        const criteria: Criterion[] = s.criteria
        return (
          <div key={s.id} className="card space-y-4 p-5">
            <div><div className="label">Approve the criteria</div>
              <div className="text-lg font-medium">{one(s.reqs).title}</div>
              <p className="mt-1 text-sm text-muted">Candidates will be rated against these, and your scorecard uses the same list. Once you approve, they're locked so every candidate is judged the same way.</p></div>
            <ul className="space-y-3">
              {criteria.map((c) => (
                <li key={c.id}><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.name}</span>
                  <span className="chip">{c.kind === 'must' ? 'Must-have' : 'Nice-to-have'}</span><span className="chip">Weight {c.weight}</span></div>
                  <p className="text-sm text-muted">{c.definition}</p></li>
              ))}
            </ul>
            <form action={approveCriteria}><input type="hidden" name="token" value={token} /><input type="hidden" name="set_id" value={s.id} />
              <button className="btn-dark w-full justify-center py-3">Approve</button></form>
            <form action={requestCriteriaChanges} className="space-y-2"><input type="hidden" name="token" value={token} /><input type="hidden" name="set_id" value={s.id} />
              <textarea name="comment" rows={2} placeholder="Something missing or off? Tell your recruiter what to change." className="input" />
              <button className="btn w-full justify-center">Request changes</button></form>
          </div>
        )
      })}

      {openCards.map((k: any) => {
        const sub = one(k.submissions), cand = one(sub.candidates), criteria: Criterion[] = one(k.req_criteria_sets).criteria
        return (
          <form key={k.id} action={submitScorecard} className="card space-y-4 p-5">
            <input type="hidden" name="token" value={token} /><input type="hidden" name="scorecard_id" value={k.id} />
            <div><div className="label">Scorecard · {k.stage_name}</div>
              <div className="text-lg font-medium">{cand.full_name}</div>
              <div className="text-sm text-muted">{one(sub.reqs).title}</div></div>
            {criteria.map((c) => (
              <fieldset key={c.id} className="space-y-1">
                <legend className="text-sm font-medium">{c.name}</legend>
                <p className="text-xs text-muted">{c.definition}</p>
                <div className="grid grid-cols-4 gap-1 pt-1">
                  {LEVELS.map((l, i) => (
                    <label key={l} className="cursor-pointer rounded-lg border border-line px-1 py-2 text-center text-xs has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white">
                      <input type="radio" name={`level_${c.id}`} value={i} className="sr-only" />{l}</label>
                  ))}
                </div>
              </fieldset>
            ))}
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">What should happen next?</legend>
              <div className="grid grid-cols-3 gap-1 pt-1">
                {[['advance', 'Move forward'], ['another_round', 'One more conversation'], ['pass', 'Pass']].map(([v, l]) => (
                  <label key={v} className="cursor-pointer rounded-lg border border-line px-1 py-2 text-center text-xs has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white">
                    <input type="radio" name="recommendation" value={v} className="sr-only" />{l}</label>
                ))}
              </div>
            </fieldset>
            <input name="comment" placeholder="One line for your recruiter (optional)" className="input" />
            <button className="btn-dark w-full justify-center py-3">Submit scorecard</button>
          </form>
        )
      })}

      {waiting.map((s: any) => {
        const a = one(s.submission_assessments)
        const criteria: Criterion[] = a ? one(a.req_criteria_sets).criteria : []
        const ratings: Ratings = a?.ratings ?? {}
        const sum = assessmentSummary(criteria, ratings)
        const cand = one(s.candidates)
        return (
          <div key={s.id} className="card space-y-4 p-5">
            <div><div className="text-lg font-medium">{cand.full_name}</div>
              <div className="text-sm text-muted">{cand.headline} · {cand.metro}</div>
              <div className="mt-1 text-sm">For {one(s.reqs).title} · {s.stage_name}</div></div>
            {criteria.length > 0 && (
              <div>
                <div className="label flex justify-between"><span>Your must-haves</span><span>{sum.met} of {sum.mustTotal} met</span></div>
                <ul className="space-y-2 text-sm">
                  {criteria.filter((c) => c.kind === 'must').map((c) => {
                    const r = ratings[c.id]
                    return <li key={c.id}><span className="mr-2 font-semibold">{ICON[r?.status ?? 'unknown']}</span>{c.name}
                      <div className="ml-5 text-xs text-muted">{STATUS_LABEL[r?.status ?? 'unknown']}{r?.evidence ? ` · ${r.evidence}` : ''}</div></li>
                  })}
                </ul>
              </div>
            )}
            <form action={decide} className="space-y-3">
              <input type="hidden" name="token" value={token} /><input type="hidden" name="submission_id" value={s.id} />
              <button name="decision" value="interview" className="btn-dark w-full justify-center py-3">Interview</button>
              <div className="flex gap-2">
                <select name="reason" className="input">{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                <button name="decision" value="pass" className="btn py-3">Pass</button>
              </div>
            </form>
          </div>
        )
      })}
      <p className="text-center text-xs text-muted">This private link was sent to {contact.name}. Candidates shown here are introduced under your agreement with {(one(link.agencies) as any).name}.</p>
    </div>
  )
}

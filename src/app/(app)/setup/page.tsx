import { supabaseServer } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const TABLES = ['agencies', 'members', 'clients', 'contacts', 'msas', 'workflow_templates', 'reqs', 'req_versions', 'req_criteria_sets', 'candidates',
  'submissions', 'submission_events', 'submission_assessments', 'scorecards', 'feedback', 'feedback_links', 'notes', 'placements', 'invoices',
  'ai_audit_log', 'resume_uploads', 'client_notes']

type Check = { title: string; ok: boolean; warn?: boolean; detail?: string; fix?: string; fixWhere?: string }

async function runChecks(): Promise<Check[]> {
  const sb = await supabaseServer()
  const out: Check[] = []

  const { data: { user } } = await sb.auth.getUser()
  out.push({ title: `Signed in as ${user?.email ?? 'nobody'}`, ok: !!user })

  const results = await Promise.all(TABLES.map(async (t) => ({ t, r: await sb.from(t).select('*', { count: 'exact', head: true }) })))
  const missing = results.filter((x) => x.r.error).map((x) => x.t)
  out.push({
    title: `Database tables (${TABLES.length - missing.length} of ${TABLES.length} found)`, ok: !missing.length,
    detail: missing.length ? `Missing or unreadable: ${missing.join(', ')}. ${results.find((x) => x.r.error)?.r.error?.message ?? ''}` : undefined,
    fixWhere: missing.length ? 'Supabase → SQL Editor' : undefined,
    fix: missing.length ? 'Run every file in the supabase/migrations folder, in filename order. Each one is a separate New query → paste → Run.' : undefined,
  })

  const search = await sb.rpc('search_candidates', { p_limit: 1 })
  out.push({
    title: 'Latest update (candidate search, client contacts, benefits list)', ok: !search.error,
    detail: search.error ? search.error.message : undefined,
    fixWhere: search.error ? 'Supabase → SQL Editor' : undefined,
    fix: search.error ? 'Run supabase/migrations/20260924000000_profiles_crm_benefits.sql (paste the whole file, then Run).' : undefined,
  })

  const agency = await sb.rpc('current_agency')
  const linked = !agency.error && !!agency.data
  const email = user?.email ?? 'YOUR-EMAIL'
  out.push({
    title: 'Your login is linked to an agency', ok: linked,
    detail: linked ? undefined : 'Without this link the database refuses to save anything you create (clients, reqs, candidates). Pages still open, they just show up empty. This is the cause of the "Application error" screen when saving a client.',
    fixWhere: linked ? undefined : 'Supabase → SQL Editor',
    fix: linked ? undefined :
      `insert into agencies (name) select 'My Agency' where not exists (select 1 from agencies);

insert into members (agency_id, user_id, role)
select (select id from agencies order by created_at limit 1), id, 'owner'
from auth.users where email = '${email.replace(/'/g, "''")}'
on conflict do nothing
returning agency_id, user_id, role;

-- You should see one row come back. If nothing comes back, this email is not in Authentication → Users.`,
  })

  let bucketOk = false, bucketMsg = ''
  try {
    const { data, error } = await supabaseAdmin().storage.getBucket('resumes')
    bucketOk = !!data && !error; bucketMsg = error?.message ?? ''
  } catch (e) { bucketMsg = e instanceof Error ? e.message : String(e) }
  out.push({
    title: 'Resume storage', ok: bucketOk, detail: bucketOk ? undefined : bucketMsg || 'The "resumes" storage bucket was not found.',
    fixWhere: bucketOk ? undefined : 'Supabase → SQL Editor',
    fix: bucketOk ? undefined : 'Run supabase/migrations/20260924000100_resume_storage.sql. If that errors, create a private bucket named resumes under Storage instead.',
  })

  const env = (k: string) => !!process.env[k]
  const keys: [string, string, string][] = [
    ['ANTHROPIC_API_KEY', 'Claude (evaluation criteria, intake, resume reading)', 'Add it under Netlify → Site configuration → Environment variables, then redeploy.'],
    ['RESEND_API_KEY', 'Sending email', 'Add it in Netlify environment variables, then redeploy.'],
    ['EMAIL_FROM', 'The "from" address on email', 'Add it in Netlify environment variables, then redeploy.'],
    ['CRON_SECRET', 'Daily reminder job', 'Add it in Netlify environment variables, then redeploy.'],
    ['APP_URL', 'Links inside emails', 'Add your site address (https://…) in Netlify environment variables, then redeploy.'],
  ]
  for (const [k, what, fix] of keys)
    out.push({ title: `${k} is set`, ok: env(k), warn: true, detail: env(k) ? undefined : `Needed for: ${what}.`, fix: env(k) ? undefined : fix, fixWhere: env(k) ? undefined : 'Netlify' })
  return out
}

export default async function Setup() {
  const checks = await runChecks()
  const broken = checks.filter((c) => !c.ok && !c.warn)
  return (
    <div className="max-w-3xl space-y-6">
      <div><h1>Setup check</h1>
        <p className="mt-1 text-muted">{broken.length ? `${broken.length} thing${broken.length > 1 ? 's' : ''} to fix before everything works.` : 'Everything the app needs to save your work is in place.'}</p></div>
      {checks.map((c) => (
        <div key={c.title} className={`card p-4 ${!c.ok && !c.warn ? 'border-red-300' : ''}`}>
          <div className="flex items-center gap-2 font-medium">
            <span className={c.ok ? 'text-ok' : c.warn ? 'text-warn' : 'text-bad'}>{c.ok ? '✓' : c.warn ? '!' : '✗'}</span>{c.title}
          </div>
          {c.detail && <p className="mt-1 text-sm text-muted">{c.detail}</p>}
          {c.fix && (
            <div className="mt-3">
              {c.fixWhere && <div className="label">Fix · {c.fixWhere}</div>}
              {c.fix.includes('\n') || c.fix.startsWith('insert') ? <pre className="overflow-x-auto rounded-lg bg-stone-100 p-3 text-xs">{c.fix}</pre> : <p className="text-sm">{c.fix}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

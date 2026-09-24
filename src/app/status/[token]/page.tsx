import { supabaseAdmin } from '@/lib/supabase/admin'

export default async function Status({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[0-9a-f-]{36}$/.test(token)) return <p className="p-10">Not found.</p>
  const admin = supabaseAdmin()
  const { data: c } = await admin.from('candidates').select('id, full_name').eq('status_token', token).maybeSingle()
  if (!c) return <p className="p-10">Not found.</p>

  const { data: subs } = await admin.from('submissions')
    .select('id, stage_index, stage_name, status, outcome, disposition, reqs(title, pay_min, pay_max, workflow, clients(name))')
    .eq('candidate_id', c.id).order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-md space-y-5 p-5">
      <div><p className="text-sm text-muted">Hi {c.full_name.split(' ')[0]},</p>
        <h1 className="text-3xl">Here's where you stand</h1>
        <p className="mt-1 text-sm text-muted">Every role shows its stage and when you'll hear back next.</p></div>
      {subs?.map((s: any) => (
        <div key={s.id} className={`card space-y-3 p-5 ${s.status === 'closed' ? 'opacity-70' : ''}`}>
          <div><div className="font-medium">{s.reqs.title}</div>
            <div className="text-sm text-muted">{s.reqs.clients.name} · ${s.reqs.pay_min / 1000}–{s.reqs.pay_max / 1000}k</div></div>
          {s.status === 'active' ? (
            <ol className="space-y-2 text-sm">
              {s.reqs.workflow.map((st: any, i: number) => (
                <li key={i} className={`flex items-center gap-2 ${i > s.stage_index ? 'text-muted' : ''} ${i === s.stage_index ? 'font-semibold' : ''}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${i < s.stage_index ? 'bg-ink' : i === s.stage_index ? 'bg-blue-600' : 'border border-stone-300'}`} />{st.name}</li>
              ))}
            </ol>
          ) : (
            <p className="whitespace-pre-wrap text-sm">{s.outcome === 'placed' ? 'Congratulations. This one is done.' : s.disposition}</p>
          )}
        </div>
      ))}
    </div>
  )
}

import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { closeSubmission, dispositionMessage } from '@/lib/close'

async function closeReq(reqId: string) {
  'use server'
  const sb = await supabaseServer()
  const { data: req } = await sb.from('reqs').select('title, clients(name)').eq('id', reqId).single()
  const { data: subs } = await sb.from('submissions')
    .select('id, candidate_id, stage_index, candidates(full_name, email)').eq('req_id', reqId).eq('status', 'active')
  for (const s of subs ?? []) await closeSubmission(sb, s, req.title, req.clients.name)
  const { error } = await sb.from('reqs').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', reqId)
  if (error) redirect(`/reqs/${reqId}?error=${encodeURIComponent(error.message)}`)
  redirect('/reqs')
}

export default async function CloseReq({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await supabaseServer()
  const { data: req } = await sb.from('reqs').select('title, clients(name)').eq('id', id).single()
  const { data: subs } = await sb.from('submissions')
    .select('id, stage_index, stage_name, candidates(full_name)').eq('req_id', id).eq('status', 'active')

  return (
    <div className="max-w-2xl space-y-6">
      <h1>Close this req</h1>
      <p className="text-muted">{req.title} · {req.clients.name}. {subs?.length} people are still waiting to hear. The req closes once they do.</p>
      <div className="card divide-y divide-line">
        {subs?.map((s) => (
          <div key={s.id} className="p-4">
            <div className="flex justify-between"><span className="font-medium">{s.candidates.full_name}</span><span className="chip">{s.stage_name}</span></div>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-sans text-sm text-muted">
              {dispositionMessage(s.stage_index, s.candidates.full_name.split(' ')[0], req.clients.name, req.title)}
            </pre>
          </div>
        ))}
      </div>
      <form action={closeReq.bind(null, id)}>
        <button className="btn-dark">Send {subs?.length} messages and close req</button>
        <p className="mt-2 text-xs text-muted">Each person's status page switches to Closed with the same message. Nothing sends until you click.</p>
      </form>
    </div>
  )
}

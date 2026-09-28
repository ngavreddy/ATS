import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { saveReq } from '../../actions'
import ReqForm from '../../ReqForm'

export default async function EditReq({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await supabaseServer()
  const { data: r } = await sb.from('reqs').select('*').eq('id', id).maybeSingle()
  if (!r) redirect('/reqs')
  if (!['draft', 'live', 'on_hold'].includes(r.status)) redirect(`/reqs/${id}?error=${encodeURIComponent('Closed and filled reqs cannot be edited.')}`)

  const [{ data: clients }, { data: contacts }] = await Promise.all([
    sb.from('clients').select('id, name').order('name'),
    sb.from('contacts').select('id, client_id, name, title, role, is_primary, status').eq('client_id', r.client_id).order('name'),
  ])
  // Reqs drafted by Claude's intake only have a free-text summary. Keep those words in "Additional benefits" so nothing is lost.
  const hasStructured = r.benefits && Object.keys(r.benefits).length > 0
  const other = r.benefits_other ?? (!hasStructured && r.benefits_summary ? r.benefits_summary : '')
  const s = (x: unknown) => (x === null || x === undefined ? '' : String(x))
  return (
    <ReqForm
      action={saveReq} clients={clients ?? []} contacts={contacts ?? []} reqId={id} status={r.status} benefits={r.benefits ?? {}}
      initial={{
        client_id: r.client_id, hiring_manager_id: s(r.hiring_manager_id), title: s(r.title), location: s(r.location), work_model: s(r.work_model),
        placement_type: s(r.placement_type), pay_min: s(r.pay_min), pay_max: s(r.pay_max), bonus_note: s(r.bonus_note), benefits_other: other,
        job_description: s(r.job_description), brief: s(r.brief), must_haves: (r.must_haves ?? []).join('\n'),
      }}
    />
  )
}

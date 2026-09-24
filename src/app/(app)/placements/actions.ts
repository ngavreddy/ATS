'use server'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'

export async function approveInvoice(invoiceId: string, placementId: string) {
  const sb = await supabaseServer()
  await sb.from('invoices').update({ status: 'approved' }).eq('id', invoiceId)
  revalidatePath(`/placements/${placementId}`)
}

export async function recordFalloff(placementId: string) {
  const sb = await supabaseServer()
  const { data: p } = await sb.from('placements').select('id, submissions(candidate_id, req_id)').eq('id', placementId).single()
  await sb.from('placements').update({ status: 'fell_off' }).eq('id', placementId)
  await sb.from('notes').insert({
    candidate_id: p.submissions.candidate_id, submission_id: null, kind: 'note',
    body: 'Falloff recorded inside the guarantee period. Replacement search owed per the MSA. Hold any refund until decided.',
  })
  revalidatePath(`/placements/${placementId}`)
}

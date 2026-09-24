'use server'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { sendFeedbackLink } from '@/lib/nudge'

export async function nudgeClient(submissionId: string) {
  const sb = await supabaseServer()
  const { data: s } = await sb.from('submissions')
    .select('id, nudge_count, candidates(full_name), reqs(title, hiring_manager_id)').eq('id', submissionId).single()
  if (!s.reqs.hiring_manager_id) throw new Error('No hiring manager on this req')
  await sendFeedbackLink(sb, s.reqs.hiring_manager_id, `Feedback needed: ${s.candidates.full_name}`,
    `A quick reminder: ${s.candidates.full_name} for ${s.reqs.title} is waiting on your feedback.`)
  await sb.from('submissions').update({ nudge_count: s.nudge_count + 1, last_nudged_at: new Date().toISOString() }).eq('id', s.id)
  revalidatePath('/today')
}

export async function touchDone(submissionId: string) {
  const sb = await supabaseServer()
  await sb.from('submissions').update({ next_touch_at: null, next_touch_note: null }).eq('id', submissionId)
  revalidatePath('/today')
}

export async function snooze(submissionId: string) {
  const sb = await supabaseServer()
  await sb.from('submissions').update({ next_touch_at: new Date(Date.now() + 864e5).toISOString() }).eq('id', submissionId)
  revalidatePath('/today')
}

import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendFeedbackLink } from '@/lib/nudge'
import { nudgeDue } from '@/lib/nudge-rules'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 })
  const admin = supabaseAdmin()

  const { data: subs } = await admin.from('submissions')
    .select('id, stage_index, stage_entered_at, nudge_count, candidates(full_name), reqs!inner(title, hiring_manager_id, workflow)')
    .eq('status', 'active')

  const due = (subs ?? []).filter((s: any) =>
    s.reqs.hiring_manager_id &&
    nudgeDue(s.reqs.workflow[s.stage_index]?.waits_on, s.nudge_count, s.stage_entered_at))

  // One email per hiring manager, not per candidate
  const byHM = new Map<string, any[]>()
  due.forEach((s: any) => byHM.set(s.reqs.hiring_manager_id, [...(byHM.get(s.reqs.hiring_manager_id) ?? []), s]))

  let sent = 0
  for (const [hm, list] of byHM) {
    try {
      const names = list.map((s) => s.candidates.full_name).join(', ')
      await sendFeedbackLink(admin, hm, `Feedback needed: ${names}`, `Waiting on your feedback for: ${names}.`)
      for (const s of list) {   // each submission moves up from its OWN count
        await admin.from('submissions').update({ nudge_count: s.nudge_count + 1, last_nudged_at: new Date().toISOString() }).eq('id', s.id)
      }
      sent++
    } catch (e) { console.error(e) }
  }
  return Response.json({ checked: subs?.length ?? 0, emailsSent: sent })
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail, esc } from './email'

export function dispositionMessage(stageIndex: number, first: string, client: string, title: string) {
  if (stageIndex >= 2)
    return `Hi ${first},\n\n${client} has moved forward with another candidate for the ${title} role. You made it to the later stages of a tough process, and I appreciated your time throughout.\n\nI'd like to keep you in mind for what's next and will reach out directly when something fits.`
  if (stageIndex === 1)
    return `Hi ${first},\n\n${client} has moved forward with other candidates for the ${title} role after reviewing profiles. Thank you for your patience.\n\nI'll reach out when a role fits your criteria.`
  return `Hi ${first},\n\nThe ${title} role at ${client} has been filled before profiles were reviewed. I wanted you to hear that from me rather than wait.\n\nI'll reach out when something fits.`
}

// s: { id, candidate_id, stage_index, candidates: { full_name, email } }
export async function closeSubmission(sb: SupabaseClient, s: any, title: string, client: string) {
  const body = dispositionMessage(s.stage_index, s.candidates.full_name.split(' ')[0], client, title)
  if (s.candidates.email) {
    try {
      await sendEmail(s.candidates.email, `Update on the ${title} role`, `<p>${esc(body).replace(/\n/g, '<br>')}</p>`)
    } catch (e) {
      console.error(e) // the status tracker still shows the disposition
    }
  }
  const now = new Date().toISOString()
  await sb.from('notes').insert({ candidate_id: s.candidate_id, submission_id: s.id, kind: 'email', body: `Disposition sent:\n${body}` })
  await sb.from('submissions').update({
    status: 'closed', outcome: 'not_selected', disposition: body, disposition_sent_at: now, next_touch_at: null,
  }).eq('id', s.id)
}

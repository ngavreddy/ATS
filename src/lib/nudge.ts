import type { SupabaseClient } from '@supabase/supabase-js'
import { newToken } from './links'
import { sendEmail, esc } from './email'

export async function sendFeedbackLink(sb: SupabaseClient, contactId: string, subject: string, intro: string) {
  const { data: c } = await sb.from('contacts').select('id, agency_id, name, email').eq('id', contactId).single()
  if (!c?.email) throw new Error('Hiring manager has no email')
  const { token, hash } = newToken()
  await sb.from('feedback_links').insert({
    agency_id: c.agency_id, contact_id: c.id, token_hash: hash,
    expires_at: new Date(Date.now() + 14 * 864e5).toISOString(),
  })
  const url = `${process.env.APP_URL}/f/${token}`
  await sendEmail(c.email, subject,
    `<p>Hi ${esc(c.name.split(' ')[0])},</p><p>${esc(intro)}</p>
     <p><a href="${url}">Review and respond (no login, about a minute)</a></p>`)
}

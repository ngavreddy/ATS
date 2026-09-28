import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { prefsOf } from '@/lib/candidate'
import { saveCandidate } from '../../actions'
import CandidateForm from '../../CandidateForm'

export default async function EditCandidate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await supabaseServer()
  const { data: c } = await sb.from('candidates').select('*').eq('id', id).maybeSingle()
  if (!c) notFound()
  const p = prefsOf(c)
  const s = (x: unknown) => (x === null || x === undefined ? '' : String(x))
  const [first, ...rest] = (c.full_name ?? '').split(' ')          // candidates saved before the profile update only have a full name
  return (
    <div className="max-w-4xl space-y-6">
      <div><Link href={`/candidates/${id}`} className="text-sm text-muted">{c.full_name} /</Link><h1>Edit candidate</h1></div>
      {!c.city && <p className="rounded-lg bg-amber-50 p-3 text-sm text-warn">This candidate was saved before city and state were required{c.metro ? ` (their old location was "${c.metro}")` : ''}. Add them to save.</p>}
      <CandidateForm action={saveCandidate} candidateId={id} initial={{
        first_name: s(c.first_name) || first, last_name: s(c.last_name) || rest.join(' '), preferred_name: s(c.preferred_name),
        email: s(c.email), phone: s(c.phone), linkedin_url: s(c.linkedin_url),
        address_line: s(c.address_line), city: s(c.city), state: s(c.state), postal_code: s(c.postal_code),
        current_title: s(c.current_title), current_employer: s(c.current_employer), years_experience: s(c.years_experience), skills: (c.skills ?? []).join(', '),
        comp_floor: s(p.comp_floor), work_models: p.work_models ?? [], willing_to_relocate: c.willing_to_relocate ? 'on' : '',
        notice_period: s(c.notice_period), work_authorization: s(c.work_authorization),
        target_titles: (c.target_titles ?? []).join(', '), dealbreakers: (p.dealbreakers ?? []).join(', '),
        source: s(c.source), referred_by: s(c.referred_by),
      }} />
    </div>
  )
}

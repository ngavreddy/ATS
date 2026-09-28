type Person = {
  first_name?: string | null; last_name?: string | null; preferred_name?: string | null; full_name?: string | null
  city?: string | null; state?: string | null; metro?: string | null
}

export const fullName = (c: Person) =>
  c.first_name || c.last_name ? [c.first_name, c.last_name].filter(Boolean).join(' ') : (c.full_name ?? '')

// What we call them in messages to them: preferred name, else first name. Older records only have full_name.
export const greetingName = (c: Person) =>
  (c.preferred_name ?? '').trim() || (c.first_name ?? '').trim() || (c.full_name ?? '').trim().split(/\s+/)[0] || ''

// "Chicago, IL". Older records fall back to the free-text metro they were saved with.
export const locationLabel = (c: Person) =>
  c.city && c.state ? `${c.city}, ${c.state}` : c.city || c.state || c.metro || ''

export function composeHeadline(p: { title?: string | null; employer?: string | null; years?: number | null }) {
  const title = (p.title ?? '').trim(), employer = (p.employer ?? '').trim()
  const base = title && employer ? `${title} at ${employer}` : title || employer
  if (!base) return null
  return p.years !== null && p.years !== undefined ? `${base} · ${p.years} yrs` : base
}

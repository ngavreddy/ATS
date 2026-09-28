export const CONTACT_ROLES: [string, string][] = [
  ['hiring_manager', 'Hiring manager'], ['hr', 'HR / talent'], ['billing', 'Billing / AP'],
  ['executive', 'Executive sponsor'], ['interviewer', 'Interviewer'], ['other', 'Other'],
]
export const ROLE_LABEL = Object.fromEntries(CONTACT_ROLES)

export type Contact = { id: string; client_id: string; name: string; title?: string | null; role: string; is_primary: boolean; status: string }

// The hiring managers you can pick for a req from this client: active, role = hiring manager, primary first
export function hiringManagersFor(contacts: Contact[], clientId: string): Contact[] {
  return contacts
    .filter((c) => c.client_id === clientId && c.role === 'hiring_manager' && c.status === 'active')
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name))
}

// Pre-select the primary manager, or the only one. Otherwise make the user choose.
export function defaultManager(list: Contact[]): string {
  return list.find((c) => c.is_primary)?.id ?? (list.length === 1 ? list[0].id : '')
}

export const CLIENT_STATUS: [string, string][] = [['prospect', 'Prospect'], ['active', 'Active'], ['inactive', 'Inactive']]

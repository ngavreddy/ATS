// Turns raw database errors into something a recruiter can act on.
export function explainDbError(message: string | null | undefined): string {
  const m = message ?? ''
  if (/row-level security|null value in column "agency_id"/i.test(m))
    return "Your login isn't linked to an agency yet, so the database refused to save this. Open the Setup check (bottom of the left menu) and follow the fix it shows."
  if (/could not find the table|relation ".*" does not exist|schema cache/i.test(m))
    return 'A database table is missing. The SQL setup files have not all been run. Open the Setup check to see which ones.'
  if (/pay_gate/.test(m)) return 'Add a pay range and at least one benefit before publishing.'
  if (/candidate_profile_required/.test(m)) return 'First name, last name, city and a 2-letter state are required.'
  if (/candidate_source_valid/.test(m)) return 'Source must be Sourced, Referral or Applicant.'
  if (/contacts_one_primary/.test(m)) return 'This client already has a primary contact. Make the other contact non-primary first.'
  if (/msas_one_active/.test(m)) return 'This client already has an active contract. Use "Replace contract terms" instead.'
  if (/must belong to the same client/i.test(m)) return "That hiring manager doesn't belong to the selected client."
  if (/inactive/i.test(m) && /contact/i.test(m)) return 'That contact is inactive. Pick an active hiring manager.'
  if (/duplicate key value/i.test(m)) return 'That already exists.'
  return m || 'Something went wrong.'
}

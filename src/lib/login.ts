// Plain-English help for the most common sign-in failures. Anything unrecognised returns null,
// and the page still shows Supabase's exact message.
export function loginHint(message: string | null | undefined): string | null {
  const m = (message ?? '').toLowerCase()
  if (!m) return null
  if (m.includes('email not confirmed'))
    return "This email isn't confirmed yet. In Supabase, open Authentication → Users and confirm it."
  if (m.includes('invalid login credentials'))
    return 'Wrong email or password. If you reset the password in Supabase, check the email matches the Users list exactly.'
  if (m.includes('api key') || m.includes('apikey') || m.includes('jwt') || m.includes('fetch failed') || m.includes('required to create'))
    return "The app can't reach Supabase with the settings it has. Check the URL and publishable key in Netlify, then redeploy."
  return null
}

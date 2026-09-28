import { redirect } from 'next/navigation'
import { explainDbError } from './db-errors'

// For actions on pages without their own form state: go back to the page with the problem in plain English
export function failTo(path: string, message: string | null | undefined): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(explainDbError(message))}`)
}

import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function supabaseAdmin(): any {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

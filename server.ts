import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Loosely typed on purpose until you run `supabase gen types` (see Step 16).
export async function supabaseServer(): Promise<any> {
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            /* called from a Server Component; middleware refreshes the session */
          }
        },
      },
    }
  )
}

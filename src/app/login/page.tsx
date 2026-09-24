import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { loginHint } from '@/lib/login'

async function login(fd: FormData) {
  'use server'
  let message: string | null = null
  try {
    const sb = await supabaseServer()
    const { error } = await sb.auth.signInWithPassword({
      email: String(fd.get('email')).trim(),   // a pasted trailing space is a common cause of "wrong password"
      password: String(fd.get('password')),
    })
    if (error) message = error.message
  } catch (e) {
    message = e instanceof Error ? e.message : 'Something went wrong'
  }
  if (message) redirect(`/login?error=${encodeURIComponent(message.slice(0, 200))}`)
  redirect('/today')
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const hint = loginHint(error)
  return (
    <div className="mx-auto mt-32 max-w-sm">
      <h1 className="mb-6">Agency ATS</h1>
      <form action={login} className="card space-y-4 p-6">
        <div><label className="label">Email</label><input name="email" type="email" required className="input" /></div>
        <div><label className="label">Password</label><input name="password" type="password" required className="input" /></div>
        {error && (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-bad">{error}</p>
            {hint && <p className="text-muted">{hint}</p>}
          </div>
        )}
        <button className="btn-dark w-full justify-center">Sign in</button>
      </form>
    </div>
  )
}

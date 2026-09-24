import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

async function login(fd: FormData) {
  'use server'
  const sb = await supabaseServer()
  const { error } = await sb.auth.signInWithPassword({
    email: String(fd.get('email')),
    password: String(fd.get('password')),
  })
  if (error) redirect('/login?error=1')
  redirect('/today')
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <div className="mx-auto mt-32 max-w-sm">
      <h1 className="mb-6">Agency ATS</h1>
      <form action={login} className="card space-y-4 p-6">
        <div><label className="label">Email</label><input name="email" type="email" required className="input" /></div>
        <div><label className="label">Password</label><input name="password" type="password" required className="input" /></div>
        {error && <p className="text-sm text-bad">Wrong email or password.</p>}
        <button className="btn-dark w-full justify-center">Sign in</button>
      </form>
    </div>
  )
}

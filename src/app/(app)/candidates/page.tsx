import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'

export default async function Candidates() {
  const sb = await supabaseServer()
  const { data } = await sb.from('candidates').select('id, full_name, headline, metro, submissions(status)').order('created_at', { ascending: false })
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><h1>Candidates</h1><Link href="/candidates/new" className="btn-dark">Add candidate</Link></div>
      <div className="card divide-y divide-line">
        {data?.map((c) => (
          <Link key={c.id} href={`/candidates/${c.id}`} className="flex justify-between p-4 hover:bg-stone-50">
            <div><div className="font-medium">{c.full_name}</div><div className="text-sm text-muted">{c.headline} · {c.metro}</div></div>
            <span className="chip self-center">{c.submissions.filter((s: any) => s.status === 'active').length} active</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

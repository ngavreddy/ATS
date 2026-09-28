import Link from 'next/link'

const nav = [
  ['Today', '/today'], ['Reqs', '/reqs'], ['Candidates', '/candidates'],
  ['Clients', '/clients'], ['Placements', '/placements'],
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-line p-4">
        <div className="mb-6 px-2 font-serif text-xl">Agency ATS</div>
        {nav.map(([label, href]) => (
          <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm hover:bg-white">{label}</Link>
        ))}
        <Link href="/setup" className="mt-auto rounded-lg px-3 py-2 text-xs text-muted hover:bg-white">Setup check</Link>
      </aside>
      <main className="min-w-0 flex-1 p-8"><div className="mx-auto max-w-6xl">{children}</div></main>
    </div>
  )
}

import { supabaseServer } from '@/lib/supabase/server'
import { saveReq } from '../actions'
import ReqForm from '../ReqForm'

export default async function NewReq({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client = '' } = await searchParams
  const sb = await supabaseServer()
  const [{ data: clients }, { data: contacts }] = await Promise.all([
    sb.from('clients').select('id, name').neq('status', 'inactive').order('name'),
    sb.from('contacts').select('id, client_id, name, title, role, is_primary, status').order('name'),
  ])
  const start = clients?.some((c: any) => c.id === client) ? client : ''
  return <ReqForm action={saveReq} clients={clients ?? []} contacts={contacts ?? []} initial={{ client_id: start }} />
}

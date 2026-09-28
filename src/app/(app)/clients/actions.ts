'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { DEFAULT_STAGES } from '@/lib/workflow'
import { today } from '@/lib/dates'
import { explainDbError } from '@/lib/db-errors'
import { failTo } from '@/lib/redirect-error'
import { one, readValues, retry, type FormState } from '@/lib/form-state'
import { parseClientForm, parseContactForm, parseContractForm } from '@/lib/client-form'

const back = (id: string) => `/clients/${id}`
const done = (id: string): never => { revalidatePath(back(id)); revalidatePath('/clients'); redirect(back(id)) }

// New client: company, first contact and contract terms are all saved here. Only the name is required.
export async function createClientRecord(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = readValues(fd)
  const c = parseClientForm(values)
  const wantsContact = !!(one(values.c_name).trim() || one(values.c_email).trim())
  const ct = wantsContact ? parseContactForm(values, 'c_') : null
  const ms = parseContractForm(values)
  const errors = [...c.errors, ...(ct?.errors ?? []), ...ms.errors]
  if (errors.length || !c.data) return retry(errors.join(' '), values)

  const sb = await supabaseServer()
  const { data: client, error } = await sb.from('clients').insert(c.data).select('id').single()
  if (error) return retry(explainDbError(error.message), values)

  const problems: string[] = []
  if (ct?.data) {
    const { error: e } = await sb.from('contacts').insert({ ...ct.data, client_id: client.id })
    if (e) problems.push(`The client was saved, but the contact was not: ${explainDbError(e.message)}`)
  }
  if (ms.data) {
    const { error: e } = await sb.rpc('replace_msa', {
      p_client: client.id, p_fee: ms.data.fee, p_guarantee: ms.data.guarantee, p_terms: ms.data.terms,
      p_noncirc: ms.data.noncirc, p_renewal: ms.data.renewal, p_signed: today(),
    })
    if (e) problems.push(`The contract terms were not saved: ${explainDbError(e.message)}`)
  }
  const { error: wf } = await sb.from('workflow_templates').insert({ client_id: client.id, stages: DEFAULT_STAGES })
  if (wf) problems.push(`The hiring workflow was not saved: ${explainDbError(wf.message)}`)

  revalidatePath('/clients')
  redirect(`${back(client.id)}${problems.length ? `?error=${encodeURIComponent(problems.join(' '))}` : ''}`)
}

export async function updateClient(fd: FormData) {
  const id = String(fd.get('client_id'))
  const r = parseClientForm(readValues(fd))
  if (!r.data) failTo(back(id), r.errors.join(' '))
  const sb = await supabaseServer()
  const { error } = await sb.from('clients').update(r.data).eq('id', id)
  if (error) failTo(back(id), error.message)
  done(id)
}

export async function addContact(fd: FormData) {
  const id = String(fd.get('client_id'))
  const r = parseContactForm(readValues(fd))
  if (!r.data) failTo(back(id), r.errors.join(' '))
  const { is_primary, ...rest } = r.data
  const sb = await supabaseServer()
  const { data, error } = await sb.from('contacts').insert({ ...rest, client_id: id }).select('id').single()
  if (error) failTo(back(id), error.message)
  if (is_primary) {
    const { error: e } = await sb.rpc('set_primary_contact', { p_contact: data.id })
    if (e) failTo(back(id), e.message)
  }
  done(id)
}

export async function updateContact(fd: FormData) {
  const id = String(fd.get('client_id'))
  const r = parseContactForm(readValues(fd))
  if (!r.data) failTo(back(id), r.errors.join(' '))
  const rest = { ...r.data, is_primary: undefined }     // primary is changed with its own button, never here
  const sb = await supabaseServer()
  const { error } = await sb.from('contacts').update(rest).eq('id', String(fd.get('contact_id')))
  if (error) failTo(back(id), error.message)
  done(id)
}

export async function makePrimary(fd: FormData) {
  const id = String(fd.get('client_id'))
  const sb = await supabaseServer()
  const { error } = await sb.rpc('set_primary_contact', { p_contact: String(fd.get('contact_id')) })
  if (error) failTo(back(id), error.message)
  done(id)
}

// People who leave are deactivated, never deleted, so old reqs and notes still make sense
export async function setContactStatus(fd: FormData) {
  const id = String(fd.get('client_id'))
  const status = String(fd.get('status')) === 'inactive' ? 'inactive' : 'active'
  const sb = await supabaseServer()
  const { error } = await sb.from('contacts').update(status === 'inactive' ? { status, is_primary: false } : { status }).eq('id', String(fd.get('contact_id')))
  if (error) failTo(back(id), error.message)
  done(id)
}

export async function replaceContract(fd: FormData) {
  const id = String(fd.get('client_id'))
  const r = parseContractForm(readValues(fd))
  if (r.errors.length) failTo(back(id), r.errors.join(' '))
  if (!r.data) failTo(back(id), 'Enter the fee % for the contract.')
  const sb = await supabaseServer()
  const { error } = await sb.rpc('replace_msa', {
    p_client: id, p_fee: r.data.fee, p_guarantee: r.data.guarantee, p_terms: r.data.terms,
    p_noncirc: r.data.noncirc, p_renewal: r.data.renewal, p_signed: today(),
  })
  if (error) failTo(back(id), error.message)
  done(id)
}

export async function addClientNote(fd: FormData) {
  const id = String(fd.get('client_id'))
  const body = String(fd.get('body') ?? '').trim()
  if (!body) failTo(back(id), 'Write a note first.')
  const contact = String(fd.get('contact_id') ?? '')
  const sb = await supabaseServer()
  const { error } = await sb.from('client_notes').insert({ client_id: id, contact_id: contact || null, body })
  if (error) failTo(back(id), error.message)
  done(id)
}

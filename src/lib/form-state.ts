// Forms keep what the person typed when something is wrong. The server action returns the values, and the form shows them again.
export type FormValues = Record<string, string | string[]>
// nonce changes on every error, so the form can rebuild its fields from the returned values (React resets dropdowns and tick boxes after an action)
export type FormState = { error?: string; values?: FormValues; linkHref?: string; linkText?: string; nonce?: number }
export const retry = (error: string, values: FormValues, extra: Partial<FormState> = {}): FormState => ({ error, values, nonce: Date.now(), ...extra })

export function readValues(fd: FormData): FormValues {
  const out: FormValues = {}
  for (const key of new Set(fd.keys())) {
    if (key.startsWith('$')) continue                       // Next.js internals
    const all = fd.getAll(key).filter((v): v is string => typeof v === 'string')
    if (!all.length) continue                               // files are not sent back
    out[key] = all.length > 1 ? all : all[0]
  }
  return out
}
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
export const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : [])

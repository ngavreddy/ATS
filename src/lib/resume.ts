import { normalizeState } from './us-states'
import { formatPhone, normalizeEmail } from './candidate'

export const MAX_RESUME_BYTES = 4 * 1024 * 1024
export const MIN_RESUME_TEXT = 80
export type ResumeKind = 'pdf' | 'docx' | 'txt'

export function checkResumeFile(name: string, size: number): string | null {
  if (!size) return 'That file is empty.'
  if (size > MAX_RESUME_BYTES) return 'That file is too big. Resumes must be under 4 MB.'
  if (!/\.(pdf|docx|txt)$/i.test(name))
    return 'Upload a PDF, Word (.docx) or text (.txt) file. For an older .doc file, save it as PDF or DOCX first.'
  return null
}

// Trust the file's contents, not its name
export function detectKind(buf: Uint8Array, name: string): ResumeKind | null {
  const head = Buffer.from(buf.slice(0, 4))
  if (head.toString('latin1') === '%PDF') return 'pdf'
  if (head[0] === 0x50 && head[1] === 0x4b && /\.docx$/i.test(name)) return 'docx'
  if (/\.txt$/i.test(name) && !Buffer.from(buf.slice(0, 2000)).includes(0)) return 'txt'
  return null
}

// Postgres cannot store NUL characters, and PDFs often contain them
export function cleanText(s: string, max = 100_000): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

export async function extractResumeText(buf: Buffer, kind: ResumeKind): Promise<string> {
  if (kind === 'txt') return cleanText(buf.toString('utf8'))
  if (kind === 'docx') {
    const m: any = await import('mammoth')
    const r = await (m.default ?? m).extractRawText({ buffer: buf })
    return cleanText(r.value)
  }
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const { text } = await extractText(pdf, { mergePages: true })
  return cleanText(text)
}

// Only the top of the resume is scanned, and the patterns have length limits, so a strange file cannot make this slow
export function guessContact(text: string) {
  const head = text.slice(0, 10_000)
  const email = /[A-Z0-9._%+-]{1,64}@[A-Z0-9-]{1,63}(?:\.[A-Z0-9-]{1,63}){1,4}/i.exec(head)?.[0] ?? null
  const phone = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.exec(head)?.[0] ?? null
  return { email: normalizeEmail(email), phone: formatPhone(phone) }
}

export type ParsedResume = {
  first_name: string | null; last_name: string | null; email: string | null; phone: string | null; linkedin_url: string | null
  city: string | null; state: string | null; current_title: string | null; current_employer: string | null
  years_experience: number | null; skills: string[]
}

const str = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

// The model's answer is treated as untrusted input: every field is checked, and anything odd becomes empty
export function normalizeParsed(raw: unknown, text: string): ParsedResume {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const guess = guessContact(text)
  const years = Number(o.years_experience)
  const skills = Array.isArray(o.skills) ? o.skills : typeof o.skills === 'string' ? o.skills.split(',') : []
  const seen = new Set<string>()
  const cleanSkills = skills.map((s) => str(s, 60)).filter((s): s is string => {
    if (!s || seen.has(s.toLowerCase())) return false
    seen.add(s.toLowerCase()); return true
  }).slice(0, 20)
  const linkedin = str(o.linkedin_url, 200)
  return {
    first_name: str(o.first_name, 60), last_name: str(o.last_name, 60),
    email: normalizeEmail(str(o.email)) ?? guess.email, phone: formatPhone(str(o.phone, 40)) ?? guess.phone,
    linkedin_url: linkedin && /linkedin\.com/i.test(linkedin) ? linkedin : null,
    city: str(o.city, 60), state: normalizeState(str(o.state, 30)),
    current_title: str(o.current_title), current_employer: str(o.current_employer),
    years_experience: Number.isInteger(years) && years >= 0 && years <= 60 ? years : null,
    skills: cleanSkills,
  }
}

export function parseModelJson(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('No JSON in the response')
  return JSON.parse(text.slice(start, end + 1))
}

// What a form needs to show a resume's contents as its starting values
export function parsedToFormValues(p: ParsedResume): Record<string, string> {
  const v: Record<string, string> = {}
  const set = (k: string, x: string | number | null) => { if (x !== null && x !== '') v[k] = String(x) }
  set('first_name', p.first_name); set('last_name', p.last_name); set('email', p.email); set('phone', p.phone)
  set('linkedin_url', p.linkedin_url); set('city', p.city); set('state', p.state)
  set('current_title', p.current_title); set('current_employer', p.current_employer)
  set('years_experience', p.years_experience); set('skills', p.skills.join(', '))
  return v
}

// Did the recruiter change what was read from the resume? Recorded in the AI audit log.
export function resumeWasEdited(parsed: Partial<ParsedResume> | null | undefined, saved: Record<string, unknown>): boolean {
  const p = parsed ?? {}
  const same = (a: unknown, b: unknown) => (a ?? '') === (b ?? '')
  return !(['first_name', 'last_name', 'email', 'phone', 'city', 'state', 'current_title', 'current_employer', 'years_experience'] as const)
    .every((k) => same(p[k], saved[k]))
}

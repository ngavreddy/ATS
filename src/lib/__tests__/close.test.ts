import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email', async (orig) => ({ ...(await orig<typeof import('@/lib/email')>()), sendEmail: vi.fn() }))
import { sendEmail } from '@/lib/email'
import { closeSubmission, dispositionMessage } from '../close'

describe('dispositionMessage (template picked from how far the person got)', () => {
  it('before review (stage 0)', () => {
    const m = dispositionMessage(0, 'Ben', 'Cobalt', 'Platform Engineer')
    expect(m).toContain('Hi Ben')
    expect(m).toContain('before profiles were reviewed')
  })
  it('after client review (stage 1)', () => {
    expect(dispositionMessage(1, 'Oscar', 'Cobalt', 'Platform Engineer')).toContain('after reviewing profiles')
  })
  it('late stage (stage 2+) acknowledges how far they got', () => {
    for (const i of [2, 3, 4]) expect(dispositionMessage(i, 'Kenji', 'Cobalt', 'Platform Engineer')).toContain('later stages')
  })
  it('always names the client and the role', () => {
    for (const i of [0, 1, 2]) {
      const m = dispositionMessage(i, 'Ana', 'Halvorsen Health', 'Data Lead')
      expect(m).toContain('Halvorsen Health')
      expect(m).toContain('Data Lead')
    }
  })
})

function fakeDb() {
  const calls: { table: string; op: string; payload: any }[] = []
  const db = {
    calls,
    from: (table: string) => ({
      insert: (payload: any) => { calls.push({ table, op: 'insert', payload }); return Promise.resolve({}) },
      update: (payload: any) => ({ eq: () => { calls.push({ table, op: 'update', payload }); return Promise.resolve({}) } }),
    }),
  }
  return db
}
const sub = (email: string | null) => ({ id: 's1', candidate_id: 'c1', stage_index: 2, candidates: { full_name: 'Kenji Watanabe', email } })

describe('closeSubmission (required closure)', () => {
  beforeEach(() => vi.mocked(sendEmail).mockReset())

  it('emails the candidate, logs the note, and closes with a disposition AND a sent timestamp', async () => {
    const db = fakeDb()
    await closeSubmission(db as never, sub('k@example.com'), 'Platform Engineer', 'Cobalt')
    expect(sendEmail).toHaveBeenCalledOnce()
    const update = db.calls.find((c) => c.table === 'submissions' && c.op === 'update')!.payload
    expect(update.status).toBe('closed')
    expect(update.outcome).toBe('not_selected')
    expect(update.disposition).toContain('Hi Kenji')
    expect(Date.parse(update.disposition_sent_at)).not.toBeNaN() // the DB constraint requires this
    expect(db.calls.find((c) => c.table === 'notes')!.payload.kind).toBe('email')
  })
  it('still closes (status tracker carries the message) when the candidate has no email', async () => {
    const db = fakeDb()
    await closeSubmission(db as never, sub(null), 'Platform Engineer', 'Cobalt')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(db.calls.find((c) => c.table === 'submissions')!.payload.status).toBe('closed')
  })
  it('does not lose the closure if the email provider is down', async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = fakeDb()
    await expect(closeSubmission(db as never, sub('k@example.com'), 'Platform Engineer', 'Cobalt')).resolves.toBeUndefined()
    expect(db.calls.find((c) => c.table === 'submissions')!.payload.status).toBe('closed')
  })
  it('clears any pending touch reminder so the Today queue empties itself', async () => {
    const db = fakeDb()
    await closeSubmission(db as never, sub('k@example.com'), 'Platform Engineer', 'Cobalt')
    expect(db.calls.find((c) => c.table === 'submissions')!.payload.next_touch_at).toBeNull()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email', async (orig) => ({ ...(await orig<typeof import('@/lib/email')>()), sendEmail: vi.fn() }))
import { sendEmail } from '@/lib/email'
import { hashToken } from '../links'
import { sendFeedbackLink } from '../nudge'

function fakeDb(contact: any) {
  const inserted: any[] = []
  return {
    inserted,
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: contact }) }) }),
      insert: (row: any) => { inserted.push({ table, row }); return Promise.resolve({}) },
    }),
  }
}

describe('sendFeedbackLink', () => {
  beforeEach(() => { vi.mocked(sendEmail).mockReset(); process.env.APP_URL = 'https://ats.example.com' })

  it('emails a link containing the raw token, but stores only its hash', async () => {
    const db = fakeDb({ id: 'k1', agency_id: 'a1', name: 'Dana Whitaker', email: 'dana@northwind.com' })
    await sendFeedbackLink(db as never, 'k1', 'Feedback needed', 'Waiting on you')

    const [to, subject, html] = vi.mocked(sendEmail).mock.calls[0]
    expect(to).toBe('dana@northwind.com')
    expect(subject).toBe('Feedback needed')
    const token = /https:\/\/ats\.example\.com\/f\/([A-Za-z0-9_-]+)/.exec(html)![1]

    const stored = db.inserted[0].row
    expect(db.inserted[0].table).toBe('feedback_links')
    expect(stored.token_hash).toBe(hashToken(token))
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(stored.agency_id).toBe('a1')
  })
  it('expires the link in about 14 days', async () => {
    const db = fakeDb({ id: 'k1', agency_id: 'a1', name: 'Dana', email: 'd@x.com' })
    await sendFeedbackLink(db as never, 'k1', 's', 'i')
    const days = (Date.parse(db.inserted[0].row.expires_at) - Date.now()) / 864e5
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThan(14.1)
  })
  it('refuses when the hiring manager has no email, rather than failing silently', async () => {
    const db = fakeDb({ id: 'k1', agency_id: 'a1', name: 'Dana', email: null })
    await expect(sendFeedbackLink(db as never, 'k1', 's', 'i')).rejects.toThrow('no email')
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it('escapes markup in the intro and name so a candidate name cannot inject HTML', async () => {
    const db = fakeDb({ id: 'k1', agency_id: 'a1', name: '<b>Dana</b> W', email: 'd@x.com' })
    await sendFeedbackLink(db as never, 'k1', 's', '<img src=x onerror=alert(1)>')
    const html = vi.mocked(sendEmail).mock.calls[0][2]
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
  })
})

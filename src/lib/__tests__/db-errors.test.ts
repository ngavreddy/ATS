import { describe, it, expect } from 'vitest'
import { explainDbError } from '../db-errors'

describe('explainDbError', () => {
  it('the exact error behind the "Application error" page: a login with no agency', () => {
    const msg = explainDbError('new row violates row-level security policy for table "clients"')
    expect(msg).toContain("isn't linked to an agency")
    expect(msg).toContain('Setup check')
  })
  it('a missing agency id gets the same help', () => expect(explainDbError('null value in column "agency_id" of relation "clients" violates not-null constraint')).toContain('linked to an agency'))
  it('missing tables point at the SQL files', () => {
    expect(explainDbError("Could not find the table 'public.clients' in the schema cache")).toContain('SQL setup files')
    expect(explainDbError('relation "public.candidates" does not exist')).toContain('SQL setup files')
  })
  it('knows the app\'s own rules', () => {
    expect(explainDbError('new row for relation "reqs" violates check constraint "pay_gate"')).toContain('pay range')
    expect(explainDbError('violates check constraint "candidate_profile_required"')).toContain('city')
    expect(explainDbError('duplicate key value violates unique constraint "contacts_one_primary"')).toContain('primary contact')
    expect(explainDbError('duplicate key value violates unique constraint "msas_one_active"')).toContain('Replace contract terms')
    expect(explainDbError('The hiring manager must belong to the same client as the req')).toContain("doesn't belong")
    expect(explainDbError('That contact is inactive. Pick an active hiring manager')).toContain('inactive')
  })
  it('passes unknown errors through unchanged, and never returns nothing', () => {
    expect(explainDbError('something odd happened')).toBe('something odd happened')
    expect(explainDbError(null)).toBe('Something went wrong.')
    expect(explainDbError('')).toBe('Something went wrong.')
  })
})

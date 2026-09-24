import crypto from 'crypto'

export function newToken() {
  const token = crypto.randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}
export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex')

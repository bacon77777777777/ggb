import crypto from 'crypto'

type AdminSessionPayload = {
  adminId: string
  exp: number
}

const base64UrlEncode = (buf: Buffer) =>
  buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

const base64UrlDecode = (s: string) => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const normalized = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64')
}

const getSecret = () => {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('Missing ADMIN_SESSION_SECRET')
  return secret
}

export const signAdminSession = (payload: AdminSessionPayload) => {
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest()
  return `${body}.${base64UrlEncode(sig)}`
}

export const verifyAdminSession = (token: string) => {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest()
  const provided = base64UrlDecode(sig)
  if (provided.length !== expected.length) return null
  if (!crypto.timingSafeEqual(provided, expected)) return null

  try {
    const parsed = JSON.parse(base64UrlDecode(body).toString('utf8')) as AdminSessionPayload
    if (!parsed?.adminId || !parsed?.exp) return null
    if (Date.now() >= parsed.exp * 1000) return null
    return parsed
  } catch {
    return null
  }
}

export const getTaipeiSessionMaxAgeSeconds = () => {
  const now = Date.now()
  const nowTzMs = now + 8 * 60 * 60 * 1000
  const nowTz = new Date(nowTzMs)
  const y = nowTz.getUTCFullYear()
  const m = nowTz.getUTCMonth()
  const d = nowTz.getUTCDate()
  const nextMidnightTzMs = Date.UTC(y, m, d + 1, 0, 0, 0)
  const diffMs = Math.max(1_000, nextMidnightTzMs - nowTzMs)
  return Math.floor(diffMs / 1000)
}


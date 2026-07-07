import { describe, it, expect } from 'vitest'
import { signAdminSession, verifyAdminSession } from '@/lib/adminSession'

const validPayload = () => ({
  adminId: 'admin-001',
  exp: Math.floor(Date.now() / 1000) + 3600,
})

describe('signAdminSession', () => {
  it('produces a two-part base64url string', () => {
    const token = signAdminSession(validPayload())
    const parts = token.split('.')
    expect(parts).toHaveLength(2)
    // base64url chars only
    expect(parts[0]).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(parts[1]).toMatch(/^[A-Za-z0-9\-_]+$/)
  })

  it('is deterministic for same payload (same second)', () => {
    const p = validPayload()
    expect(signAdminSession(p)).toBe(signAdminSession(p))
  })

  it('different adminId produces different token', () => {
    const p = validPayload()
    const a = signAdminSession({ ...p, adminId: 'a' })
    const b = signAdminSession({ ...p, adminId: 'b' })
    expect(a).not.toBe(b)
  })
})

describe('verifyAdminSession', () => {
  it('round-trips correctly', () => {
    const p = validPayload()
    const token = signAdminSession(p)
    const result = verifyAdminSession(token)
    expect(result?.adminId).toBe(p.adminId)
    expect(result?.exp).toBe(p.exp)
  })

  it('rejects expired token', () => {
    const token = signAdminSession({ adminId: 'admin-001', exp: Math.floor(Date.now() / 1000) - 1 })
    expect(verifyAdminSession(token)).toBeNull()
  })

  it('rejects tampered body', () => {
    const token = signAdminSession(validPayload())
    const [body, sig] = token.split('.')
    const tampered = body.slice(0, -2) + 'XX' + '.' + sig
    expect(verifyAdminSession(tampered)).toBeNull()
  })

  it('rejects tampered signature', () => {
    const token = signAdminSession(validPayload())
    const [body] = token.split('.')
    expect(verifyAdminSession(body + '.invalidsig')).toBeNull()
  })

  it('rejects missing separator', () => {
    expect(verifyAdminSession('notavalidtoken')).toBeNull()
  })

  it('rejects empty string', () => {
    expect(verifyAdminSession('')).toBeNull()
  })
})

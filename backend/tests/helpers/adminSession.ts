import { signAdminSession } from '@/lib/adminSession'

export function makeAdminCookie(adminId = 'test-admin', ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const token = signAdminSession({ adminId, exp })
  return `admin_session=${token}`
}

export function makeExpiredAdminCookie(adminId = 'test-admin'): string {
  const exp = Math.floor(Date.now() / 1000) - 1
  const token = signAdminSession({ adminId, exp })
  return `admin_session=${token}`
}

import { cookies } from 'next/headers'
import { verifyAdminSession } from '@/lib/adminSession'

export async function requireAdminSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_session')?.value
  if (!token) return null
  return verifyAdminSession(token)
}


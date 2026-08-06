import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function POST(request: Request) {
  // 要在清掉 cookie 之前讀 session，不然就不知道是誰登出的。
  // action_logs 裡那批「登出」是舊程式留下的，這支路由一直沒有補回來
  const session = await requireAdminSession()
  if (session) {
    await logAdminAction({
      adminId: session.adminId,
      action: '後台登出',
      ip: getClientIp(request),
    })
  }

  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')
  const secure = proto === 'https'
  const cookieStore = await cookies()
  cookieStore.set('admin_session', '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return NextResponse.json({ success: true })
}

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
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

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getTaipeiSessionMaxAgeSeconds, signAdminSession } from '@/lib/adminSession'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const username = String(body?.username || '').trim()
    const password = String(body?.password || '')

    if (!username || !password) {
      return NextResponse.json({ error: '缺少帳號或密碼' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data: admin, error } = await supabaseAdmin
      .from('admins')
      .select('id, username, nickname, status, password_hash, role:roles(name)')
      .eq('username', username)
      .single()

    if (error || !admin) {
      return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
    }

    if (admin.status !== 'active') {
      return NextResponse.json({ error: '帳號已停用' }, { status: 403 })
    }

    if (admin.password_hash !== password) {
      return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
    }

    const maxAge = getTaipeiSessionMaxAgeSeconds()
    const exp = Math.floor(Date.now() / 1000) + maxAge
    const token = signAdminSession({ adminId: String(admin.id), exp })

    const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')
    const secure = proto === 'https'

    const cookieStore = await cookies()
    cookieStore.set('admin_session', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge,
    })

    await supabaseAdmin
      .from('admins')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', admin.id)

    return NextResponse.json({
      user: {
        id: String(admin.id),
        username: admin.username,
        nickname: admin.nickname || '',
        role: (admin as any).role?.name || 'admin',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '登入失敗' }, { status: 500 })
  }
}

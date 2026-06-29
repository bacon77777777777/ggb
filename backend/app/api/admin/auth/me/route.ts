import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyAdminSession } from '@/lib/adminSession'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_session')?.value
    if (!token) return NextResponse.json({ user: null }, { status: 401 })

    const payload = verifyAdminSession(token)
    if (!payload) return NextResponse.json({ user: null }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data: admin, error } = await supabaseAdmin
      .from('admins')
      .select('id, username, nickname, status, role:roles(name)')
      .eq('id', payload.adminId)
      .single()

    if (error || !admin || admin.status !== 'active') {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: String(admin.id),
        username: admin.username,
        nickname: admin.nickname || '',
        role: (admin as any).role?.name || 'admin',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}


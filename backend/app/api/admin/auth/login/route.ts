import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getTaipeiSessionMaxAgeSeconds, signAdminSession } from '@/lib/adminSession'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'

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
      .select('id, username, nickname, status, password_hash, supplier_id, role:roles(name, permissions)')
      .eq('username', username)
      .single()

    if (error || !admin) {
      return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
    }

    if (admin.status !== 'active') {
      return NextResponse.json({ error: '帳號已停用' }, { status: 403 })
    }

    if (admin.password_hash !== password) {
      await logAdminAction({
        adminId: admin.id,
        action: '登入失敗',
        detail: { username },
        ip: getClientIp(request),
        status: 'fail',
      })
      return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 })
    }

    const maxAge = getTaipeiSessionMaxAgeSeconds()
    const exp = Math.floor(Date.now() / 1000) + maxAge
    const roleName: string = (admin as any).role?.name || 'admin'
    const rolePerms: string[] = (admin as any).role?.permissions || []
    // 廠商帳號一定要有所屬廠商，否則後台每一頁都會是空的而且看不出原因。
    // 資料層有觸發器擋（migration 468），這裡是第二道防線 —— 資料若被繞過寫進去，
    // 至少不要讓它登入成功之後在後台亂逛。
    const supplierId: number | null = (admin as any).supplier_id ?? null
    if (roleName === 'supplier' && !supplierId) {
      return NextResponse.json({ error: '此廠商帳號尚未綁定廠商，請聯絡管理員' }, { status: 403 })
    }

    // 廠商停用 = 不再合作，它的帳號也該進不來。
    // 只擋登入不動任何歷史資料 —— 既有商品、訂單與結算都還在，
    // 停用是「不再接新案」，不是把過去抹掉
    if (roleName === 'supplier' && supplierId) {
      const { data: sup } = await supabaseAdmin
        .from('suppliers').select('is_active').eq('id', supplierId).maybeSingle()
      if (sup && sup.is_active === false) {
        return NextResponse.json({ error: '所屬廠商已停用，請聯絡平台管理員' }, { status: 403 })
      }
    }

    const token = signAdminSession({
      adminId: String(admin.id), exp, role: roleName, permissions: rolePerms,
      ...(supplierId ? { supplierId } : {}),
    })

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

    await logAdminAction({
      adminId: admin.id,
      action: '後台登入',
      ip: getClientIp(request),
    })

    return NextResponse.json({
      user: {
        id: String(admin.id),
        username: admin.username,
        nickname: admin.nickname || '',
        role: roleName,
        permissions: rolePerms,
        supplierId,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '登入失敗' }, { status: 500 })
  }
}

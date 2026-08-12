import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getClientIp } from '@/lib/logAdminAction'

/** 角色代碼 → 稽核紀錄上顯示的中文 */
const ROLE_LABEL: Record<string, string> = {
  super_admin: '超級管理員',
  superadmin: '超級管理員',
  warehouse_staff: '貨物專員',
  operation_staff: '營運專員',
  marketing_staff: '行銷專員',
  supplier: '廠商',
  admin: '管理員',
}

/**
 * 前端寫稽核紀錄的入口（`useLog().addLog()`、`lib/logExport`）
 *
 * **身分與 IP 一律由伺服器從 session 取，不收前端傳的值。**
 * 以前 username／role／ip 都照 body 寫進 `action_logs`：
 *   - 想偽造誰做了什麼，改一下 request body 就成立，稽核軌跡等於沒有效力
 *   - 而且前端根本拿不到真 IP，`LogContext.getUserIP()` 是回
 *     `192.168.1.<亂數>` —— 整欄都是假的
 * 現在 username／role 用 adminId 去 `admins` 查、IP 走 x-forwarded-for。
 *
 * 前端只負責描述「做了什麼」：action／target／details。
 */
export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const action = String(body?.action || '')
    if (!action) return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data: admin } = await supabaseAdmin
      .from('admins')
      .select('username, role:roles(name)')
      .eq('id', session.adminId)
      .single()

    const { error } = await supabaseAdmin.from('action_logs').insert({
      admin_id: Number(session.adminId),
      username: admin?.username || `admin#${session.adminId}`,
      role: (admin as any)?.role?.name || ROLE_LABEL[session.role || ''] || '管理員',
      action,
      target: String(body?.target || ''),
      details: String(body?.details || ''),
      ip: getClientIp(request),
      status: body?.status === 'failed' ? 'failed' : 'success',
    })
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '寫入失敗' }, { status: 500 })
  }
}

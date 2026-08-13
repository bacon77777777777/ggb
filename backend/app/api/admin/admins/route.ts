import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

type AdminStatus = 'active' | 'inactive'

type AdminPayload = {
  id?: number
  username: string
  nickname?: string
  role_id: number
  supplier_id?: number | null
  status: AdminStatus
  password?: string
}

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('admins')
      .select(
        `
        id,
        username,
        nickname,
        password_hash,
        role_id,
        supplier_id,
        status,
        last_login_at,
        created_at,
        role:roles (
          id,
          name,
          display_name,
          permissions
        )
      `
      )
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '載入管理員失敗'
    console.error('Error loading admins:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as Partial<AdminPayload>
    const username = String(body.username || '').trim()
    const roleId = Number(body.role_id)
    const status = (body.status === 'inactive' ? 'inactive' : 'active') as AdminStatus
    const nickname = String(body.nickname || '')
    const password = body.password ? String(body.password) : ''
    // 廠商角色一定要綁廠商。資料層有觸發器擋（migration 468），
    // 但錯誤訊息從資料庫冒上來對使用者不友善，這裡先擋一次講清楚
    const supplierId = body.supplier_id ? Number(body.supplier_id) : null

    const { data: roleRow } = await getSupabaseAdmin().from('roles').select('name').eq('id', roleId).maybeSingle()
    if (roleRow?.name === 'supplier' && !supplierId) {
      return NextResponse.json({ error: '廠商角色必須指定所屬廠商' }, { status: 400 })
    }
    if (roleRow?.name !== 'supplier' && supplierId) {
      return NextResponse.json({ error: '只有廠商角色可以指定所屬廠商' }, { status: 400 })
    }

    if (!username || !Number.isFinite(roleId) || roleId <= 0) {
      return NextResponse.json({ error: '資料不完整' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      username,
      nickname,
      role_id: roleId,
      supplier_id: supplierId,
      status,
    }

    if (password) {
      payload.password_hash = password
    }

    const supabaseAdmin = getSupabaseAdmin()

    if (typeof body.id === 'number' && Number.isFinite(body.id)) {
      const { error } = await supabaseAdmin.from('admins').update(payload).eq('id', body.id)
      if (error) {
        console.error('Update admin error:', error)
        return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 })
      }
      await logAdminAction({ adminId: session.adminId, action: '更新管理員', targetType: 'admins', targetId: String(body.id), detail: { username, status }, ip: getClientIp(request) })
      return NextResponse.json({ ok: true })
    }

    if (!password) {
      return NextResponse.json({ error: '新增管理員需設定密碼' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.from('admins').insert([payload])
    if (error) {
      console.error('Insert admin error:', error)
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 })
    }
    await logAdminAction({ adminId: session.adminId, action: '新增管理員', targetType: 'admins', detail: { username, role_id: roleId }, ip: getClientIp(request) })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const e = error as any
    const message = e?.message || e?.error_description || JSON.stringify(e) || '儲存管理員失敗'
    console.error('Error saving admin:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}


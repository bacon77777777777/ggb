import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('roles')
      .select('*')
      .order('id')

    if (error) {
      throw error
    }

    return NextResponse.json(data ?? [])
  } catch (error: any) {
    console.error('Error loading roles:', error)
    return NextResponse.json(
      { error: error.message || '載入角色失敗' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const supabaseAdmin = getSupabaseAdmin()

    if (body.id) {
      const { error } = await supabaseAdmin
        .from('roles')
        .update({
          display_name: body.display_name,
          permissions: body.permissions,
          // 沒帶 updated_at 的話，從權限管理頁改過的角色看起來還停在
          // migration 執行的時間 —— 查「這個權限是誰什麼時候改的」會查錯方向
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.id)

      if (error) {
        throw error
      }
    } else {
      const { error } = await supabaseAdmin
        .from('roles')
        .insert([
          {
            name: body.name,
            display_name: body.display_name,
            permissions: body.permissions,
          },
        ])

      if (error) {
        throw error
      }
    }

    // 權限異動是最該留痕的一種：改完之後別人能做什麼就變了
    await logAdminAction({
      adminId: session.adminId,
      action: body.id ? '修改角色權限' : '新增角色',
      targetType: 'role',
      targetId: String(body.id ?? body.name ?? ''),
      detail: { name: body.name, display_name: body.display_name, permissions: body.permissions },
      ip: getClientIp(request),
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error saving role:', error)
    return NextResponse.json(
      { error: error.message || '儲存角色失敗' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { fetchAllRows } from '@/lib/fetchAllRows'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()

    // .limit(2000) 是無效的寫法：PostgREST 上限就是 1,000 筆，多寫的會被靜默忽略
    const data = await fetchAllRows<any>(() => supabaseAdmin
      .from('user_event_logs')
      .select('id, user_id, event_type, detail, ip, created_at')
      .order('created_at', { ascending: false }))

    // 撈 user 名稱
    const userIds = [...new Set((data ?? []).map((r: any) => r.user_id).filter(Boolean))]
    const nameById = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .in('id', userIds)
      for (const u of users ?? []) {
        nameById.set(u.id, u.name || u.email || u.id)
      }
    }

    const result = (data ?? []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      userName: nameById.get(r.user_id) || r.user_id || '-',
      eventType: r.event_type,
      detail: r.detail,
      ip: r.ip || '',
      createdAt: r.created_at,
    }))

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

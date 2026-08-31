import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 立即開獎（後台手動觸發；正常情況由 cron 到時間自動跑）
 *
 * 實際的抽選在 DB 的 draw_lottery()：用登記截止前就公布的 seed 對每筆登記的
 * entry_no 取 sha256 排序，前 N 名正取、接著 M 名備取。開獎後 seed 會公開，
 * 任何人都能自己重算 —— 所以這裡不做任何抽選邏輯，只是把觸發權交給後台。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc('draw_lottery', { p_event_id: Number(id) })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (data && data.success === false) {
    return NextResponse.json({ error: data.message }, { status: 400 })
  }

  await logAdminAction({
    adminId: session.adminId, action: '抽籤販售開獎',
    targetType: 'lottery_events', targetId: id, detail: data, ip: getClientIp(request),
  })
  return NextResponse.json({ result: data })
}

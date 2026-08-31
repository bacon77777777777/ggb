import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 編輯／刪除檔期。
 *
 * 兩個不能碰的東西：
 *   已開獎（drawn_at 非 NULL）—— 名額、機率、seed 全部凍結。改了就等於事後動手腳，
 *   而承諾值早在登記截止前就公布了，玩家對得出來。
 *   有人登記了 —— 入場積分與名額不准改。玩家是照當時的條件付的積分。
 */
const FROZEN_AFTER_ENTRY = ['entry_points', 'winners_count', 'backup_count', 'per_user_entries'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const supabase = getSupabaseAdmin()

  const { data: ev } = await supabase.from('lottery_events').select('*').eq('id', id).single()
  if (!ev) return NextResponse.json({ error: '找不到檔期' }, { status: 404 })

  if (ev.drawn_at && body.status !== 'cancelled') {
    return NextResponse.json({ error: '這一檔已經開獎，不能再修改' }, { status: 400 })
  }

  const { count: entryCount } = await supabase
    .from('lottery_entries').select('id', { count: 'exact', head: true }).eq('event_id', id)

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const ALLOWED = ['title', 'subtitle', 'brand', 'cover_image_url', 'content', 'entry_points',
    'per_user_entries', 'winners_count', 'backup_count', 'price_tokens', 'pay_deadline_hours',
    'register_start_at', 'register_end_at', 'draw_at', 'show_entry_count', 'status', 'sort_order']
  for (const k of ALLOWED) if (body[k] !== undefined) patch[k] = body[k]

  if ((entryCount ?? 0) > 0) {
    const blocked = FROZEN_AFTER_ENTRY.filter(k => patch[k] !== undefined && patch[k] !== ev[k])
    if (blocked.length) {
      return NextResponse.json({
        error: `已經有 ${entryCount} 人登記，不能再改：${blocked.join('、')}`,
      }, { status: 400 })
    }
  }

  /*
   * 一發布就把承諾值定下來（sha256(seed)）。
   * 等到開獎才產 seed 等於沒有事前承諾 —— 玩家沒辦法證明我們不是看完名單才決定的。
   */
  if (patch.status === 'published' && !ev.commitment) {
    await supabase.rpc('ensure_lottery_commitment', { p_event_id: Number(id) })
  }

  const { data, error } = await supabase
    .from('lottery_events').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAdminAction({
    adminId: session.adminId, action: '編輯抽籤販售檔期',
    targetType: 'lottery_events', targetId: id, detail: patch, ip: getClientIp(request),
  })
  return NextResponse.json({ event: data })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  /*
   * 有人登記過就不准刪 —— 玩家花了積分，紀錄刪掉就查不到了。
   * 要下架請改成「取消」（status = cancelled），那條路會退積分。
   */
  const { count } = await supabase
    .from('lottery_entries').select('id', { count: 'exact', head: true }).eq('event_id', id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `已經有 ${count} 人登記，不能刪除。請改用「取消檔期」（會退還積分）`,
    }, { status: 400 })
  }

  const { error } = await supabase.from('lottery_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAdminAction({
    adminId: session.adminId, action: '刪除抽籤販售檔期',
    targetType: 'lottery_events', targetId: id, ip: getClientIp(request),
  })
  return NextResponse.json({ ok: true })
}

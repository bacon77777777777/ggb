import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'
import { phaseOf } from '@/lib/lottery'

/**
 * 抽籤販售檔期（lottery_events，migration 652/653）
 *
 * 階段（登記中／待開獎／已開獎）不存欄位，由時間現算 —— 算法在 lib/lottery，
 * 不放在這裡是因為 Next.js 的 route.ts 只能匯出 handler。
 */

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('lottery_events')
    .select('*, product:products(id, name, image_url, type, price)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /*
   * 登記數一次撈完再分組，不要每一檔各發一次 count query。
   * 檔期數量不多（一次幾檔），但登記可能上千 —— 只取 event_id 與 status 兩欄。
   */
  const ids = (data ?? []).map(e => e.id)
  const counts: Record<number, { entries: number; won: number; paid: number }> = {}
  if (ids.length) {
    const { data: rows } = await supabase
      .from('lottery_entries')
      .select('event_id, status')
      .in('event_id', ids)
    for (const r of rows ?? []) {
      const c = (counts[r.event_id] ??= { entries: 0, won: 0, paid: 0 })
      if (r.status !== 'refunded') c.entries++
      if (r.status === 'won') c.won++
      if (r.status === 'paid') c.paid++
    }
  }

  return NextResponse.json({
    events: (data ?? []).map(e => ({
      ...e,
      phase: phaseOf(e as any),
      counts: counts[e.id] ?? { entries: 0, won: 0, paid: 0 },
    })),
  })
}

/** 建檔期。一律建成 draft —— 發布是另一個明確的動作，不要一存檔就對外開放 */
export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.from('lottery_events').insert({
    product_id: body.product_id,
    title: body.title || null,
    // 品牌／IP（migration 665）。前台列表的分類頁籤照這欄分組
    brand: body.brand?.trim() || null,
    subtitle: body.subtitle || null,
    cover_image_url: body.cover_image_url || null,
    entry_points: Number(body.entry_points),
    per_user_entries: Number(body.per_user_entries ?? 1),
    winners_count: Number(body.winners_count),
    backup_count: Number(body.backup_count ?? 5),
    price_tokens: Number(body.price_tokens),
    pay_deadline_hours: Number(body.pay_deadline_hours ?? 48),
    register_start_at: body.register_start_at,
    register_end_at: body.register_end_at,
    draw_at: body.draw_at,
    show_entry_count: body.show_entry_count === true,
    status: 'draft',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await logAdminAction({
    adminId: session.adminId, action: '新增抽籤販售檔期',
    targetType: 'lottery_events', targetId: String(data.id),
    detail: { title: data.title, product_id: data.product_id }, ip: getClientIp(request),
  })
  return NextResponse.json({ event: data })
}

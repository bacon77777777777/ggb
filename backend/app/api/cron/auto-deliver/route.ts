import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { createLinePusher } from '@/lib/linePush'
const pushLine = createLinePusher('line_push_deliver')

const CRON_SECRET       = process.env.CRON_SECRET ?? ''
// 超過幾天 shipping 狀態自動視為已送達（HOME=7天，CVS=3天）
const HOME_DAYS = 7
const CVS_DAYS  = 3


export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // 撈出所有 shipping 狀態且已出貨時間超過閾值的訂單
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_number, logistics_type, shipped_at, user_id')
    .eq('status', 'shipping')
    .not('shipped_at', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!orders || orders.length === 0) return NextResponse.json({ ok: true, delivered: 0 })

  const now = Date.now()
  const toDeliver = orders.filter(o => {
    const days = o.logistics_type === 'CVS' ? CVS_DAYS : HOME_DAYS
    const shippedMs = new Date(o.shipped_at).getTime()
    return (now - shippedMs) >= days * 86400 * 1000
  })

  if (toDeliver.length === 0) return NextResponse.json({ ok: true, delivered: 0 })

  const ids = toDeliver.map(o => o.id)

  const { error: updateErr } = await supabase
    .from('orders')
    .update({ status: 'delivered' })
    .in('id', ids)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 推送用戶通知
  for (const o of toDeliver) {
    if (!o.user_id) continue
    await supabase.from('notifications').insert({
      user_id:  o.user_id,
      type:     'order_status',
      title:    '訂單已送達',
      body:     `您的配送訂單 ${o.order_number} 已確認送達，感謝您的購買！`,
      link:     '/profile?tab=delivery',
      meta:     { order_number: o.order_number, status: 'delivered' },
    })
  }

  await pushLine(`📦 自動確認送達\n共 ${toDeliver.length} 筆訂單已超過出貨天數，自動標記為已送達\n${toDeliver.map(o => o.order_number).join('、')}`)

  return NextResponse.json({ ok: true, delivered: toDeliver.length, orders: toDeliver.map(o => o.order_number) })
}

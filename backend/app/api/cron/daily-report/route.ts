import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''
const TW_MS       = 8 * 3600_000

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()

    // Yesterday window in TW time (UTC+8)
    const twNow = new Date(Date.now() + TW_MS)
    const twToday = new Date(Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate()))
    const yestStart = new Date(twToday.getTime() - TW_MS - 86400_000)
    const yestEnd   = new Date(twToday.getTime() - TW_MS)
    const monthStart = new Date(Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), 1) - TW_MS)

    const [
      rechargeYest,
      drawYest,
      newUsersRes,
      rechargeMonth,
      { count: pendingShipments },
      { count: lowInventory },
      { count: pendingRefunds },
      { count: pendingSettlements },
      { count: pendingReview },
    ] = await Promise.all([
      supabase.from('recharge_records').select('amount').eq('status', 'success')
        .gte('created_at', yestStart.toISOString()).lt('created_at', yestEnd.toISOString()),
      supabase.from('draw_records').select('user_id, product:products(price)')
        .gte('created_at', yestStart.toISOString()).lt('created_at', yestEnd.toISOString()),
      supabase.from('users').select('id', { count: 'exact', head: true })
        .or('is_bot.eq.false,is_bot.is.null')
        .gte('created_at', yestStart.toISOString()).lt('created_at', yestEnd.toISOString()),
      supabase.from('recharge_records').select('amount').eq('status', 'success')
        .gte('created_at', monthStart.toISOString()),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('products').select('id', { count: 'exact', head: true }).gt('total_count', 0).lte('remaining', 3).neq('status', 'archived'),
      supabase.from('refund_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('settlement_snapshots').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('recharge_records').select('id', { count: 'exact', head: true }).eq('needs_review', true).eq('status', 'pending'),
    ])

    const recharges     = rechargeYest.data ?? []
    const draws         = drawYest.data ?? []
    const totalRecharge = recharges.reduce((s, r) => s + Number(r.amount), 0)
    const totalSpent    = draws.reduce((s, r) => s + Number((r.product as any)?.price ?? 0), 0)
    const drawCount     = draws.length
    const uniquePlayers = new Set(draws.map(d => d.user_id)).size
    const newUsers      = newUsersRes.count ?? 0
    const monthTotal    = (rechargeMonth.data ?? []).reduce((s, r) => s + Number(r.amount), 0)

    const yestLabel = new Date(yestStart.getTime() + TW_MS)
      .toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })

    const pendingLines: string[] = []
    if ((pendingShipments  ?? 0) > 0) pendingLines.push(`📦 待配送 ${pendingShipments} 筆`)
    if ((lowInventory      ?? 0) > 0) pendingLines.push(`⚠️ 低庫存 ${lowInventory} 件`)
    if ((pendingRefunds    ?? 0) > 0) pendingLines.push(`↩️ 待審退款 ${pendingRefunds} 筆`)
    if ((pendingSettlements ?? 0) > 0) pendingLines.push(`📋 廠商月結 ${pendingSettlements} 份`)
    if ((pendingReview     ?? 0) > 0) pendingLines.push(`🔍 待複核儲值 ${pendingReview} 筆`)

    const lines = [
      `☀️ 吉吉比 每日早報`,
      yestLabel,
      ``,
      `【昨日數據】`,
      `💰 儲值金額　NT$ ${fmt(totalRecharge)}`,
      `🎮 消費金額　NT$ ${fmt(totalSpent)}`,
      `🎯 抽獎次數　${fmt(drawCount)} 次`,
      `👤 參與玩家　${fmt(uniquePlayers)} 人`,
      `🆕 新增會員　${fmt(newUsers)} 人`,
      ``,
      `【本月累計儲值】`,
      `💵 NT$ ${fmt(monthTotal)}`,
      ``,
      pendingLines.length > 0
        ? `【待處理事項】\n${pendingLines.join('\n')}`
        : `✅ 無待處理事項`,
    ]

    await pushLine(lines.join('\n'))

    return NextResponse.json({ ok: true, date: yestLabel, totalRecharge, totalSpent, drawCount, uniquePlayers, newUsers, monthTotal })
  } catch (e: any) {
    console.error('[daily-report] error:', e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

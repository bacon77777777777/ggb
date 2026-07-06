import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
// 推播目標：NOTIFY_TARGET_TYPE = 'user' | 'group'，NOTIFY_TARGET_ID = userId 或 groupId
const NOTIFY_TYPE = process.env.NOTIFY_TARGET_TYPE ?? 'user'
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID   ?? ''

async function pushLineMessage(text: string): Promise<{ status: number; body: unknown }> {
  if (!LINE_TOKEN || !NOTIFY_ID) {
    console.warn('[daily-report] LINE_TOKEN or NOTIFY_ID missing')
    return { status: 0, body: 'missing config' }
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      to: NOTIFY_ID,
      messages: [{ type: 'text', text }],
    }),
  })
  const body = await res.json().catch(() => res.text())
  console.log('[daily-report] LINE push status:', res.status, JSON.stringify(body))
  return { status: res.status, body }
}

export async function POST(req: NextRequest) {
  // 驗證 CRON_SECRET（pg_cron / 外部 cron 服務帶此 header）
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()

    // 昨日台灣時間 00:00 ~ 23:59（UTC+8）
    const now = new Date()
    const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    const twYesterday = new Date(twNow)
    twYesterday.setUTCDate(twYesterday.getUTCDate() - 1)
    const yyyymmdd = twYesterday.toISOString().slice(0, 10)
    const startUTC = new Date(`${yyyymmdd}T16:00:00.000Z`) // 昨日 00:00 CST = 前天 16:00 UTC
    const endUTC   = new Date(`${yyyymmdd}T15:59:59.999Z`) // 昨日 23:59 CST = 今日 07:59 UTC
    // 修正：用 UTC offset 重算
    const dayStart = new Date(Date.UTC(
      twYesterday.getUTCFullYear(), twYesterday.getUTCMonth(), twYesterday.getUTCDate(),
      0, 0, 0
    ) - 8 * 3600_000) // 昨日 00:00 CST → UTC
    const dayEnd = new Date(dayStart.getTime() + 86400_000 - 1)

    const [{ data: recharges }, { data: draws }, { data: newUsers }, { count: pendingShipments }, { count: lowInventory }] =
      await Promise.all([
        supabase
          .from('recharge_records')
          .select('amount')
          .gte('created_at', dayStart.toISOString())
          .lt('created_at',  dayEnd.toISOString()),
        supabase
          .from('draw_records')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', dayStart.toISOString())
          .lt('created_at',  dayEnd.toISOString()),
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .or('is_bot.eq.false,is_bot.is.null')
          .gte('created_at', dayStart.toISOString())
          .lt('created_at',  dayEnd.toISOString()),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
        supabase.from('products').select('id', { count: 'exact', head: true }).gt('total_count', 0).lte('remaining', 3).neq('status', 'archived'),
      ])

    const gmv     = (recharges ?? []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
    const drawCnt = (draws as any) ?? 0
    const nuCnt   = (newUsers as any) ?? 0

    const dateLabel = `${twYesterday.getUTCFullYear()}/${String(twYesterday.getUTCMonth() + 1).padStart(2, '0')}/${String(twYesterday.getUTCDate()).padStart(2, '0')}`

    const lines = [
      `📊 吉吉比 每日早報`,
      `📅 ${dateLabel}`,
      ``,
      `💰 昨日儲值（GMV）：NT$${gmv.toLocaleString()}`,
      `🎰 抽獎次數：${drawCnt} 次`,
      `👤 新增用戶：${nuCnt} 人`,
      ``,
      `📦 待配送訂單：${pendingShipments ?? 0} 筆${(pendingShipments ?? 0) > 0 ? ' ⚠️' : ''}`,
      `🔴 庫存警示：${lowInventory ?? 0} 項${(lowInventory ?? 0) > 0 ? ' ⚠️' : ''}`,
    ]

    const message = lines.join('\n')
    const lineResult = await pushLineMessage(message)

    return NextResponse.json({ ok: true, date: dateLabel, gmv, drawCnt, nuCnt, line: lineResult })
  } catch (e: any) {
    console.error('[daily-report] error:', e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

// 方便手動觸發測試（GET + secret）
export async function GET(req: NextRequest) {
  return POST(req)
}

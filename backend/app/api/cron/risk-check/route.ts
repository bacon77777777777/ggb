import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()

    // 讀取設定
    const { data: settings } = await supabase.from('risk_alert_settings').select('key, value')
    const cfg = Object.fromEntries((settings ?? []).map((r: any) => [r.key, r.value]))
    if (cfg.risk_alert_enabled === 'false') {
      return NextResponse.json({ ok: true, skipped: true })
    }
    const tokenThreshold = Number(cfg.token_burn_1h_threshold ?? 5000)
    const inventoryThreshold = Number(cfg.low_inventory_threshold ?? 5)

    const alerts: string[] = []

    // ── 1. 代幣消耗異常：最近 1 小時內單帳號消耗超過閾值 ──────────────────
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { data: recentDraws } = await supabase
      .from('draw_records')
      .select('user_id, products(price)')
      .gte('created_at', oneHourAgo)
      .not('user_id', 'is', null)

    // 按 user_id 累計消耗代幣
    const burnByUser: Record<string, number> = {}
    for (const d of recentDraws ?? []) {
      if (!d.user_id) continue
      const price = Number((d.products as any)?.price ?? 0)
      burnByUser[d.user_id] = (burnByUser[d.user_id] ?? 0) + price
    }

    const anomalousUsers = Object.entries(burnByUser)
      .filter(([, burn]) => burn >= tokenThreshold)
      .sort(([, a], [, b]) => b - a)

    if (anomalousUsers.length > 0) {
      // 取 email 方便識別
      const userIds = anomalousUsers.map(([id]) => id)
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds)
      const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]))

      const lines = anomalousUsers.slice(0, 5).map(([uid, burn]) => {
        const u = userMap[uid]
        return `  • ${u?.name ?? u?.email ?? uid}：${burn.toLocaleString()} G`
      })
      alerts.push(`🚨 代幣異常消耗（1小時閾值：${tokenThreshold.toLocaleString()} G）\n${lines.join('\n')}`)
    }

    // ── 2. 庫存不足 ────────────────────────────────────────────────────────
    const { data: lowProducts } = await supabase
      .from('products')
      .select('name, remaining, total_count')
      .gt('total_count', 0)
      .lte('remaining', inventoryThreshold)
      .neq('status', 'archived')
      .order('remaining', { ascending: true })
      .limit(10)

    if (lowProducts && lowProducts.length > 0) {
      const lines = lowProducts.map((p: any) => `  • ${p.name}：剩 ${p.remaining} 個`)
      alerts.push(`📦 庫存不足預警（閾值：≤${inventoryThreshold} 個）\n${lines.join('\n')}`)
    }

    // ── 推播 ─────────────────────────────────────────────────────────────
    if (alerts.length > 0) {
      const msg = `⚠️ 吉吉比 風控警報\n${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n\n${alerts.join('\n\n')}`
      await pushLine(msg)
    }

    return NextResponse.json({ ok: true, alertCount: alerts.length })
  } catch (e: any) {
    console.error('[risk-check] error:', e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}

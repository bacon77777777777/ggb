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

    const tokenThreshold       = Number(cfg.token_burn_1h_threshold  ?? 5000)
    const inventoryThreshold   = Number(cfg.low_inventory_threshold   ?? 5)
    const multiIpWindowH       = Number(cfg.multi_ip_window_hours     ?? 24)
    const multiIpMinUsers      = Number(cfg.multi_ip_min_users        ?? 3)
    const rechargeRateCount    = Number(cfg.recharge_rate_count       ?? 5)
    const rechargeRateWindowM  = Number(cfg.recharge_rate_window_min  ?? 60)
    const logisticsOverdueDays = Number(cfg.logistics_overdue_days    ?? 7)

    const alerts: string[] = []
    const now = Date.now()

    // ── 1. 代幣消耗異常：最近 1 小時單帳號消耗超過閾值 ──────────────────
    const oneHourAgo = new Date(now - 3_600_000).toISOString()
    const { data: recentDraws } = await supabase
      .from('draw_records')
      .select('user_id, products(price)')
      .gte('created_at', oneHourAgo)
      .not('user_id', 'is', null)

    const burnByUser: Record<string, number> = {}
    for (const d of recentDraws ?? []) {
      if (!d.user_id) continue
      burnByUser[d.user_id] = (burnByUser[d.user_id] ?? 0) + Number((d.products as any)?.price ?? 0)
    }
    const anomalousUsers = Object.entries(burnByUser)
      .filter(([, burn]) => burn >= tokenThreshold)
      .sort(([, a], [, b]) => b - a)

    if (anomalousUsers.length > 0) {
      const userIds = anomalousUsers.map(([id]) => id)
      const { data: users } = await supabase.from('users').select('id, name, email').in('id', userIds)
      const userMap = Object.fromEntries((users ?? []).map((u: any) => [u.id, u]))
      const lines = anomalousUsers.slice(0, 5).map(([uid, burn]) => {
        const u = userMap[uid]
        return `  • ${u?.name ?? u?.email ?? uid}：${burn.toLocaleString()} G`
      })
      alerts.push(`🚨 代幣異常消耗（1小時閾值：${tokenThreshold.toLocaleString()} G）\n${lines.join('\n')}`)
    }

    // ── 2. 庫存不足 ────────────────────────────────────────────────────
    const { data: lowProducts } = await supabase
      .from('products')
      .select('name, remaining')
      .gt('total_count', 0)
      .lte('remaining', inventoryThreshold)
      .neq('status', 'archived')
      .order('remaining', { ascending: true })
      .limit(10)

    if (lowProducts && lowProducts.length > 0) {
      const lines = lowProducts.map((p: any) => `  • ${p.name}：剩 ${p.remaining} 個`)
      alerts.push(`📦 庫存不足預警（閾值：≤${inventoryThreshold} 個）\n${lines.join('\n')}`)
    }

    // ── 3. 同 IP 多帳號偵測 ────────────────────────────────────────────
    const multiIpSince = new Date(now - multiIpWindowH * 3_600_000).toISOString()
    const { data: ipLogs } = await supabase
      .from('user_ip_log')
      .select('ip, user_id')
      .gte('created_at', multiIpSince)
      .neq('ip', 'unknown')

    if (ipLogs && ipLogs.length > 0) {
      const ipUserMap: Record<string, Set<string>> = {}
      for (const r of ipLogs) {
        if (!ipUserMap[r.ip]) ipUserMap[r.ip] = new Set()
        ipUserMap[r.ip].add(r.user_id)
      }
      const suspicious = Object.entries(ipUserMap)
        .filter(([, s]) => s.size >= multiIpMinUsers)
        .sort(([, a], [, b]) => b.size - a.size)

      if (suspicious.length > 0) {
        const lines = suspicious.slice(0, 5).map(([ip, s]) => `  • IP ${ip}：${s.size} 個帳號`)
        alerts.push(`🕵️ 同IP多帳號偵測（${multiIpWindowH}h內 ≥${multiIpMinUsers}帳號）\n${lines.join('\n')}`)
      }
    }

    // ── 4. 速率異常儲值：短時間內大量儲值成功 ──────────────────────────
    const rechargeWindowAgo = new Date(now - rechargeRateWindowM * 60_000).toISOString()
    const { data: recentRecharges } = await supabase
      .from('recharge_records')
      .select('user_id')
      .eq('status', 'success')
      .gte('created_at', rechargeWindowAgo)
      .not('user_id', 'is', null)

    const rechargeByUser: Record<string, number> = {}
    for (const r of recentRecharges ?? []) {
      rechargeByUser[r.user_id] = (rechargeByUser[r.user_id] ?? 0) + 1
    }
    const rapidRechargersIds = Object.entries(rechargeByUser)
      .filter(([, cnt]) => cnt >= rechargeRateCount)
      .sort(([, a], [, b]) => b - a)

    if (rapidRechargersIds.length > 0) {
      const uids = rapidRechargersIds.map(([id]) => id)
      const { data: ulist } = await supabase.from('users').select('id, name, email').in('id', uids)
      const umap = Object.fromEntries((ulist ?? []).map((u: any) => [u.id, u]))
      const lines = rapidRechargersIds.slice(0, 5).map(([uid, cnt]) => {
        const u = umap[uid]
        return `  • ${u?.name ?? u?.email ?? uid}：${cnt} 筆（${rechargeRateWindowM}分鐘內）`
      })
      alerts.push(`💳 速率異常儲值（門檻：${rechargeRateWindowM}min/${rechargeRateCount}筆）\n${lines.join('\n')}`)
    }

    // ── 5. 物流逾期：超過 N 天無狀態更新 ───────────────────────────────
    const overdueSince = new Date(now - logisticsOverdueDays * 86_400_000).toISOString()
    const { data: overdueOrders } = await supabase
      .from('orders')
      .select('order_number, status, submitted_at, shipped_at')
      .not('status', 'in', '("delivered","cancelled")')
      .lt('submitted_at', overdueSince)
      .order('submitted_at', { ascending: true })
      .limit(20)

    if (overdueOrders && overdueOrders.length > 0) {
      const statusText: Record<string, string> = {
        submitted: '待處理', processing: '處理中', picked_up: '已攬收', shipping: '配送中',
      }
      const lines = overdueOrders.slice(0, 10).map((o: any) => {
        const days = Math.floor((now - new Date(o.submitted_at).getTime()) / 86_400_000)
        return `  • ${o.order_number}（${statusText[o.status] ?? o.status}，${days}天）`
      })
      alerts.push(`🚚 物流逾期警報（超過 ${logisticsOverdueDays} 天未完成）\n${lines.join('\n')}`)
    }

    // ── 推播 ─────────────────────────────────────────────────────────
    if (alerts.length > 0) {
      const msg = `⚠️ 吉吉比 風控警報\n${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n\n${alerts.join('\n\n')}`
      await pushLine(msg)
    }

    return NextResponse.json({ ok: true, alertCount: alerts.length, checks: alerts.map((a, i) => a.split('\n')[0]) })
  } catch (e: any) {
    console.error('[risk-check] error:', e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}

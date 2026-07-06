import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''

// 可透過 env 調整閾值
const OVERDUE_DAYS          = Number(process.env.SUPPLY_OVERDUE_DAYS         ?? 3)
const LOW_STOCK_PCT         = Number(process.env.SUPPLY_LOW_STOCK_PCT         ?? 20)  // 剩餘 < 20%
const SETTLEMENT_OVERDUE    = Number(process.env.SUPPLY_SETTLEMENT_OVERDUE    ?? 7)   // draft > 7天

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const urgent: string[] = []
  const notice: string[] = []

  // ── 1. 超時未出貨訂單（按廠商分組）────────────────────────────────
  const { data: overdueOrders } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT
        COALESCE(s.name, '未分配廠商') AS supplier_name,
        COUNT(o.id)                    AS order_count,
        MAX(NOW() - o.created_at)      AS max_wait,
        ROUND(EXTRACT(EPOCH FROM MAX(NOW() - o.created_at)) / 86400) AS max_days
      FROM orders o
      LEFT JOIN suppliers s ON s.id = o.supplier_id
      WHERE o.status = 'submitted'
        AND o.created_at < NOW() - INTERVAL '${OVERDUE_DAYS} days'
      GROUP BY s.name
      ORDER BY max_days DESC
    `,
  })
  for (const r of (overdueOrders as any[] ?? [])) {
    const line = `${r.supplier_name}：${r.order_count} 筆待出貨，最久等待 ${r.max_days} 天`
    r.max_days >= OVERDUE_DAYS * 2 ? urgent.push(line) : notice.push(line)
  }

  // ── 2. 庫存緊張（剩餘低於原始總量 X%，按廠商分組）────────────────
  const { data: lowStock } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT
        COALESCE(s.name, '未分配廠商') AS supplier_name,
        p.name                         AS product_name,
        p.remaining,
        p.total_count,
        ROUND(p.remaining::numeric / NULLIF(p.total_count,0) * 100) AS pct
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.status = 'active'
        AND p.total_count > 0
        AND p.remaining::numeric / NULLIF(p.total_count,0) < ${LOW_STOCK_PCT} / 100.0
        AND p.remaining > 0
      ORDER BY pct ASC
      LIMIT 10
    `,
  })
  for (const r of (lowStock as any[] ?? [])) {
    notice.push(`庫存緊張 [${r.supplier_name}] ${r.product_name}：剩 ${r.remaining}/${r.total_count} 件（${r.pct}%）`)
  }

  // ── 3. 庫存歸零但仍上架──────────────────────────────────────────
  const { data: zeroActive } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT
        COALESCE(s.name, '未分配廠商') AS supplier_name,
        p.name AS product_name, p.product_code
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.status = 'active' AND p.remaining = 0 AND p.total_count > 0
      LIMIT 10
    `,
  })
  for (const r of (zeroActive as any[] ?? [])) {
    urgent.push(`庫存歸零仍上架 [${r.supplier_name}] ${r.product_name} — 需下架或補貨`)
  }

  // 零庫存 → agent_events（dedup：24小時內不重複）
  if ((zeroActive as any[]).length > 0) {
    const { data: existingEvents } = await supabase
      .from('agent_events')
      .select('payload')
      .eq('event_type', 'restock_needed')
      .eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())

    const existingNames = new Set(
      (existingEvents ?? []).map((e: any) => e.payload?.product_name as string)
    )

    const newEvents = (zeroActive as any[])
      .filter(r => !existingNames.has(r.product_name))
      .map(r => ({
        event_type:   'restock_needed',
        source_agent: 'supply_chain',
        payload: {
          product_name:  r.product_name,
          supplier_name: r.supplier_name,
          product_code:  r.product_code ?? null,
          remaining:     0,
          issue:         '零庫存但仍上架，前台仍可瀏覽',
        },
      }))

    if (newEvents.length > 0) {
      await supabase.from('agent_events').insert(newEvents)
    }
  }

  // ── 4. 廠商月結久未確認────────────────────────────────────────────
  const { data: staleDrafts } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT
        supplier_name,
        to_char(period_start, 'YYYY-MM') AS period,
        ROUND(EXTRACT(EPOCH FROM NOW() - created_at) / 86400) AS days_pending
      FROM settlement_snapshots
      WHERE status = 'draft'
        AND created_at < NOW() - INTERVAL '${SETTLEMENT_OVERDUE} days'
      ORDER BY created_at ASC
      LIMIT 5
    `,
  })
  for (const r of (staleDrafts as any[] ?? [])) {
    notice.push(`月結未確認：${r.supplier_name} ${r.period} 已等待 ${r.days_pending} 天`)
  }

  // ── 5. 廠商績效快照（週一才推，其他時間略過）──────────────────────
  const isMonday = new Date(Date.now() + 8 * 3600_000).getUTCDay() === 1
  let perfLines: string[] = []
  if (isMonday) {
    const { data: perf } = await supabase.rpc('execute_readonly_sql', {
      query: `
        SELECT
          COALESCE(s.name, '未分配') AS supplier_name,
          COUNT(o.id)                AS total_orders,
          COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) AS delivered,
          COUNT(CASE WHEN o.status = 'submitted'
            AND o.created_at < NOW() - INTERVAL '${OVERDUE_DAYS} days' THEN 1 END) AS overdue
        FROM orders o
        LEFT JOIN suppliers s ON s.id = o.supplier_id
        WHERE o.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY s.name
        ORDER BY total_orders DESC
      `,
    })
    for (const r of (perf as any[] ?? [])) {
      const rate = r.total_orders > 0 ? Math.round(r.delivered / r.total_orders * 100) : 0
      perfLines.push(`${r.supplier_name}：${r.total_orders} 筆訂單，出貨率 ${rate}%，逾期 ${r.overdue} 筆`)
    }
  }

  // ── 推送 LINE ─────────────────────────────────────────────────────
  if (urgent.length === 0 && notice.length === 0 && perfLines.length === 0) {
    return NextResponse.json({ ok: true, urgent: 0, notice: 0 })
  }

  const now = new Date(Date.now() + 8 * 3600_000)
  const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`
  const lines = [`📦 供應鏈協調員報告｜${timeStr}`]

  if (urgent.length > 0) {
    lines.push('\n🔴 需立即處理')
    urgent.forEach(u => lines.push(`• ${u}`))
  }
  if (notice.length > 0) {
    lines.push('\n🟡 留意事項')
    notice.forEach(n => lines.push(`• ${n}`))
  }
  if (perfLines.length > 0) {
    lines.push('\n📊 本月廠商績效（近30天）')
    perfLines.forEach(p => lines.push(`• ${p}`))
  }

  await pushLine(lines.join('\n'))
  return NextResponse.json({ ok: true, urgent: urgent.length, notice: notice.length })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createLinePusher } from '@/lib/linePush'
const pushLine = createLinePusher('line_push_risk')

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

// Thresholds (override via env if needed)
const DRAW_ANOMALY_COUNT   = Number(process.env.RISK_DRAW_THRESHOLD   ?? 80)   // 24h draws per user
const RECHARGE_SINGLE_MAX  = Number(process.env.RISK_RECHARGE_SINGLE  ?? 5000) // single recharge NT$
const RECHARGE_DAILY_MAX   = Number(process.env.RISK_RECHARGE_DAILY   ?? 10000)// daily total NT$
const ADMIN_OP_MAX         = Number(process.env.RISK_ADMIN_OPS        ?? 20)   // admin write ops in 24h


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

  const high: string[] = []   // 🔴 需立即處理
  const warn: string[] = []   // 🟡 留意

  // ── 1. 代幣異常消耗：24h 內抽獎超過閾值的真人用戶 ────────────────
  const { data: heavyDrawers } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT u.name, u.email, COUNT(dr.id) AS draw_count
      FROM draw_records dr
      JOIN users u ON u.id = dr.user_id
      WHERE dr.created_at >= NOW() - INTERVAL '24 hours'
        AND (u.is_bot IS NULL OR u.is_bot = false)
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(dr.id) >= ${DRAW_ANOMALY_COUNT}
      ORDER BY draw_count DESC
      LIMIT 5
    `,
  })
  for (const r of (heavyDrawers as any[] ?? [])) {
    high.push(`用戶 ${r.name ?? r.email}：24h 抽獎 ${r.draw_count} 次（異常高頻）`)
  }

  // ── 2. 大額儲值：單筆超過閾值 ────────────────────────────────────
  const { data: bigRecharges } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT u.name, u.email, rr.amount, rr.order_number, rr.created_at
      FROM recharge_records rr
      JOIN users u ON u.id = rr.user_id
      WHERE rr.status = 'success'
        AND rr.amount >= ${RECHARGE_SINGLE_MAX}
        AND rr.created_at >= NOW() - INTERVAL '24 hours'
        AND (u.is_bot IS NULL OR u.is_bot = false)
      ORDER BY rr.amount DESC
      LIMIT 5
    `,
  })
  for (const r of (bigRecharges as any[] ?? [])) {
    warn.push(`大額儲值：${r.name ?? r.email} NT$ ${Number(r.amount).toLocaleString()}\n  訂單 ${r.order_number}`)
  }

  // ── 3. 單日累計大額儲值 ───────────────────────────────────────────
  const { data: dailyBig } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT u.name, u.email, SUM(rr.amount) AS total
      FROM recharge_records rr
      JOIN users u ON u.id = rr.user_id
      WHERE rr.status = 'success'
        AND rr.created_at >= NOW() - INTERVAL '24 hours'
        AND (u.is_bot IS NULL OR u.is_bot = false)
      GROUP BY u.id, u.name, u.email
      HAVING SUM(rr.amount) >= ${RECHARGE_DAILY_MAX}
      ORDER BY total DESC
      LIMIT 5
    `,
  })
  for (const r of (dailyBig as any[] ?? [])) {
    warn.push(`當日累計大額：${r.name ?? r.email} 今日儲值 NT$ ${Number(r.total).toLocaleString()}`)
  }

  // ── 4. 庫存歸零（上架中的商品）────────────────────────────────────
  const { data: zeroStock } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT name, product_code, total_count
      FROM products
      WHERE remaining = 0 AND status = 'active' AND total_count > 0
      ORDER BY total_count DESC
      LIMIT 10
    `,
  })
  for (const r of (zeroStock as any[] ?? [])) {
    warn.push(`庫存歸零：${r.name}（${r.product_code ?? ''}），原本 ${r.total_count} 件`)
  }

  // ── 5. 管理員異常高頻寫入操作 ─────────────────────────────────────
  const { data: adminOps } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT admin_id, COUNT(*) AS op_count
      FROM admin_action_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY admin_id
      HAVING COUNT(*) >= ${ADMIN_OP_MAX}
      ORDER BY op_count DESC
      LIMIT 5
    `,
  })
  for (const r of (adminOps as any[] ?? [])) {
    warn.push(`管理員高頻操作：${r.admin_id} 24h 執行 ${r.op_count} 次寫入`)
  }

  // ── 6. 連續付款失敗（潛在測卡行為）──────────────────────────────
  const { data: failedRecharges } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT u.name, u.email, COUNT(*) AS fail_count
      FROM recharge_records rr
      JOIN users u ON u.id = rr.user_id
      WHERE rr.status = 'failed'
        AND rr.created_at >= NOW() - INTERVAL '24 hours'
        AND (u.is_bot IS NULL OR u.is_bot = false)
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(*) >= 5
      ORDER BY fail_count DESC
      LIMIT 5
    `,
  })
  for (const r of (failedRecharges as any[] ?? [])) {
    high.push(`連續付款失敗：${r.name ?? r.email} 24h 內失敗 ${r.fail_count} 次（潛在測卡）`)
  }

  // ── 推送 LINE ─────────────────────────────────────────────────────
  const now = new Date(Date.now() + 8 * 3600_000)
  const timeStr = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')}`

  if (high.length === 0 && warn.length === 0) {
    await pushLine(`風控｜${timeStr}\n目前無問題`)
    return NextResponse.json({ ok: true, high: 0, warn: 0 })
  }

  const lines = [`風控｜${timeStr}`]

  if (high.length > 0) {
    lines.push('\n高風險（請盡快確認）')
    high.forEach(h => lines.push(`• ${h}`))
  }
  if (warn.length > 0) {
    warn.forEach(w => lines.push(`• ${w}`))
  }

  lines.push('\n以上僅供參考，處置權在老闆。')
  await pushLine(lines.join('\n'))

  return NextResponse.json({ ok: true, high: high.length, warn: warn.length })
}

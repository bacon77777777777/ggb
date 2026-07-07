import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { formatTaiwanDate, formatTaiwanTime } from '@/lib/financeMetrics'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''

// 代幣對帳允許誤差（每用戶）
const TOKEN_DIFF_THRESHOLD = Number(process.env.CFO_TOKEN_DIFF_THRESHOLD ?? 50)

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

// ─── Data gathering ──────────────────────────────────────────────────────────

async function gatherMetrics(supabase: any) {
  const q = (sql: string) => supabase.rpc('execute_readonly_sql', { query: sql }).then((r: any) => r.data ?? [])

  const [
    revenueTrend,
    monthlyRevenue,
    refundStats,
    pendingSettlements,
    tokenPlatform,
    topupPending,
  ] = await Promise.all([

    // 近7天每日儲值（真人）
    q(`
      SELECT
        (created_at AT TIME ZONE 'Asia/Taipei')::date AS day,
        COUNT(*) AS orders,
        SUM(amount) AS revenue
      FROM recharge_records
      WHERE status = 'success'
        AND COALESCE(payment_method, '') NOT IN ('test', 'promotion', 'compensation')
        AND created_at >= NOW() - INTERVAL '7 days'
        AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
      GROUP BY 1 ORDER BY 1
    `),

    // 本月 vs 上個月儲值比較
    q(`
      SELECT
        to_char(date_trunc('month', created_at AT TIME ZONE 'Asia/Taipei'), 'YYYY-MM') AS month,
        SUM(amount) AS revenue,
        COUNT(*) AS orders
      FROM recharge_records
      WHERE status = 'success'
        AND COALESCE(payment_method, '') NOT IN ('test', 'promotion', 'compensation')
        AND (created_at AT TIME ZONE 'Asia/Taipei') >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Taipei') - INTERVAL '1 month'
        AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
      GROUP BY 1 ORDER BY 1
    `),

    // 退款統計（本月）
    q(`
      SELECT
        status,
        COUNT(*) AS cnt,
        SUM(amount_twd) AS total_twd,
        SUM(tokens_to_deduct) AS tokens
      FROM refund_requests
      WHERE (created_at AT TIME ZONE 'Asia/Taipei') >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Taipei')
      GROUP BY status
    `),

    // 待確認月結
    q(`
      SELECT
        supplier_name,
        to_char(period_start,'YYYY-MM') AS period,
        supplier_net,
        status
      FROM settlement_snapshots
      WHERE status IN ('draft','confirmed')
      ORDER BY period_start, supplier_name
    `),

    // 全平台代幣對帳
    q(`
      SELECT
        COALESCE(SUM(u.tokens),0) AS current_total,
        (SELECT COALESCE(SUM(amount + COALESCE(bonus,0)),0)
         FROM recharge_records
         WHERE status='success'
           AND COALESCE(payment_method, '') NOT IN ('test', 'promotion', 'compensation')
           AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
        ) AS real_recharge_total,
        (SELECT COALESCE(SUM(delta),0)
         FROM token_ledger
         WHERE type IN ('recharge','marketing','test','manual','draw','dismantle')
           AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
        ) AS ledger_total,
        (SELECT COALESCE(SUM(-delta),0)
         FROM token_ledger
         WHERE type='draw'
           AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
        ) AS draw_spend_g,
        (SELECT COALESCE(SUM(delta),0)
         FROM token_ledger
         WHERE type='dismantle'
           AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
        ) AS dismantle_return_g,
        (SELECT COALESCE(SUM(tokens_to_deduct),0)
         FROM refund_requests
         WHERE status='processed'
           AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
        ) AS refund_deducted,
        (SELECT COALESCE(SUM(delta),0)
         FROM token_adjustments
         WHERE user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
        ) AS manual_total
      FROM users u
      WHERE (u.is_bot IS NULL OR u.is_bot = false)
    `),

    // 超過 2 小時未完成的儲值單
    q(`
      SELECT COUNT(*) AS cnt, SUM(amount) AS total
      FROM recharge_records
      WHERE status='pending'
        AND created_at < NOW() - INTERVAL '2 hours'
        AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
    `),
  ])

  return { revenueTrend, monthlyRevenue, refundStats, pendingSettlements, tokenPlatform, topupPending }
}

async function gatherUserTokenMismatches(supabase: any) {
  const { data } = await supabase.rpc('execute_readonly_sql', {
    query: `
      SELECT
        u.id,
        u.name,
        u.email,
        u.tokens AS actual,
        COALESCE((
          SELECT SUM(delta)
          FROM token_ledger
          WHERE user_id=u.id
        ),0) AS ledger_total,
        COALESCE((
          SELECT SUM(tokens_to_deduct) FROM refund_requests
          WHERE user_id=u.id AND status='processed'
        ),0) AS refund_out,
        0 AS manual_adj
      FROM users u
      WHERE (u.is_bot IS NULL OR u.is_bot = false)
        AND u.tokens > 0
    `,
  })
  const rows = (data ?? []) as any[]
  return rows
    .map(r => ({
      ...r,
      expected: Number(r.ledger_total ?? 0) - Number(r.refund_out ?? 0),
      diff:     Number(r.actual) - (Number(r.ledger_total ?? 0) - Number(r.refund_out ?? 0)),
    }))
    .filter(r => Math.abs(r.diff) > TOKEN_DIFF_THRESHOLD)
}

// ─── Claude analysis ──────────────────────────────────────────────────────────

function buildDeterministicAnalysis(metrics: any, mismatches: any[], platformDiff: number) {
  const trend = metrics.revenueTrend as any[]
  const total7d = trend.reduce((s: number, r: any) => s + Number(r.revenue ?? 0), 0)
  const latest = trend[trend.length - 1]
  const latestRevenue = Number(latest?.revenue ?? 0)
  const stuckTopup = Number((metrics.topupPending[0] as any)?.cnt ?? 0)
  const pendingSettlements = (metrics.pendingSettlements as any[]).length

  const alerts: string[] = []
  if (Math.abs(platformDiff) > 50) alerts.push(`代幣對帳差異 ${platformDiff > 0 ? '+' : ''}${platformDiff} G`)
  if (mismatches.length > 0) alerts.push(`${mismatches.length} 位會員代幣需複核`)
  if (stuckTopup > 0) alerts.push(`${stuckTopup} 筆 pending 儲值超時`)
  if (pendingSettlements > 0) alerts.push(`${pendingSettlements} 筆廠商月結待處理`)

  if (alerts.length === 0) {
    return `近7天儲值金額 NT$ ${total7d.toLocaleString()}，最近一日 NT$ ${latestRevenue.toLocaleString()}。代幣對帳正常，暫無超時儲值或重大財務異常。`
  }
  return `近7天儲值金額 NT$ ${total7d.toLocaleString()}，最近一日 NT$ ${latestRevenue.toLocaleString()}。需注意：${alerts.join('、')}。`
}

async function analyzeWithClaude(metrics: any, mismatches: any[], isMonday: boolean, reportDate: string, platformDiff: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const fallback = buildDeterministicAnalysis(metrics, mismatches, platformDiff)
  if (!apiKey) return fallback

  const { revenueTrend, monthlyRevenue, refundStats, pendingSettlements, tokenPlatform, topupPending } = metrics

  const tp   = (tokenPlatform[0] ?? {}) as any
  const expected = Number(tp.ledger_total ?? 0) - Number(tp.refund_deducted ?? 0)
  const actual   = Number(tp.current_total ?? 0)
  const actualMinusExpected = actual - expected

  const context = `
你是 GGB（吉吉比）轉蛋平台的 AI 財務長，請根據以下財務數據，用繁體中文寫出每日財務健康摘要。
限制：
- 80字以內，只能輸出一段純文字
- 不要 Markdown、不要標題、不要條列、不要「日期：[待補充]」
- 不可自行發明數字；只能使用下方資料
- 詞彙固定：「儲值金額」單位 NT$；「抽獎消費」單位 G

報表日期：${reportDate}
## 近7天每日儲值
${JSON.stringify(revenueTrend)}

## 本月/上月比較
${JSON.stringify(monthlyRevenue)}

## 本月退款狀況
${JSON.stringify(refundStats)}

## 待確認月結清單
${JSON.stringify(pendingSettlements)}

## 平台代幣對帳
- 用戶實際持有總代幣：${actual}
- 按交易記錄計算應有：${expected}
- 差異（實際-帳務）：${actualMinusExpected > 0 ? '+' : ''}${actualMinusExpected}（絕對值 > 50 需關注）

${isMonday ? `## 個人代幣差異用戶（週一深查）\n${JSON.stringify(mismatches.slice(0,5))}` : ''}

## Pending 超時儲值單
${JSON.stringify(topupPending)}
`.trim()

  const client = new Anthropic({ apiKey })
  const res = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages:   [{ role: 'user', content: context }],
  })

  const text = ((res.content[0] as any)?.text ?? '').trim()
  if (!text || text.includes('待補充') || text.includes('#') || text.length > 180) return fallback
  return text
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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

  const twNow    = new Date(Date.now() + 8 * 3600_000)
  const isMonday = twNow.getUTCDay() === 1
  const timeStr  = formatTaiwanTime()
  const reportDate = formatTaiwanDate(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })

  const [metrics, mismatches] = await Promise.all([
    gatherMetrics(supabase),
    isMonday ? gatherUserTokenMismatches(supabase) : Promise.resolve([]),
  ])

  const tp      = (metrics.tokenPlatform[0] ?? {}) as any
  const expected = Number(tp.ledger_total ?? 0) - Number(tp.refund_deducted ?? 0)
  const actual   = Number(tp.current_total ?? 0)
  const platformDiff = actual - expected

  const pendingDraft   = (metrics.pendingSettlements as any[]).filter(r => r.status === 'draft')
  const pendingConfirm = (metrics.pendingSettlements as any[]).filter(r => r.status === 'confirmed')
  const stuckTopup     = Number((metrics.topupPending[0] as any)?.cnt ?? 0)

  // 判斷是否有重大異常（決定是否一定要推）
  const hasUrgent = Math.abs(platformDiff) > 500
    || stuckTopup > 0
    || mismatches.length > 0

  const analysis = await analyzeWithClaude(metrics, mismatches, isMonday, reportDate, platformDiff)

  // 組裝 LINE 訊息
  const lines: string[] = [`財務長日報｜${timeStr}`]
  lines.push(reportDate)

  // 近7天收入趨勢
  const trend = metrics.revenueTrend as any[]
  if (trend.length > 0) {
    const total7d = trend.reduce((s: number, r: any) => s + Number(r.revenue ?? 0), 0)
    const avg7d   = Math.round(total7d / trend.length)
    const latest  = trend[trend.length - 1]
    const todayRev = Number(latest?.revenue ?? 0)
    const dropPct  = avg7d > 0 ? Math.round((1 - todayRev / avg7d) * 100) : 0
    lines.push(`\n近7天儲值 NT$ ${total7d.toLocaleString()}（日均 NT$ ${avg7d.toLocaleString()}）`)
    if (dropPct > 30) lines.push(`注意：最近一日較日均下滑 ${dropPct}%`)
  }

  // 代幣對帳
  lines.push(`\n代幣對帳`)
  lines.push(`• 用戶實際持有：${actual.toLocaleString()} G`)
  lines.push(`• 帳務應有：${expected.toLocaleString()} G`)
  if (Math.abs(platformDiff) > 50) {
    lines.push(`⚠️ 差異 ${platformDiff > 0 ? '+' : ''}${platformDiff} G（需確認）`)
  } else {
    lines.push(`✅ 差異 ${platformDiff} G（正常）`)
  }

  // 個人差異（週一才列）
  if (isMonday && mismatches.length > 0) {
    lines.push(`\n個人代幣差異（週查）`)
    mismatches.slice(0, 5).forEach(m => {
      lines.push(`• ${m.name ?? m.email}：差異 ${m.diff > 0 ? '+' : ''}${m.diff} G（實際 ${m.actual}，帳務 ${m.expected}）`)
    })
  }

  // 待處理月結
  if (pendingDraft.length > 0) {
    const totalDraft = pendingDraft.reduce((s: number, r: any) => s + Number(r.supplier_net ?? 0), 0)
    lines.push(`\n待確認月結：${pendingDraft.length} 筆，合計 NT$ ${totalDraft.toLocaleString()}`)
    pendingDraft.slice(0, 3).forEach((r: any) => {
      lines.push(`• ${r.supplier_name} ${r.period}`)
    })
  }
  if (pendingConfirm.length > 0) {
    const totalConfirm = pendingConfirm.reduce((s: number, r: any) => s + Number(r.supplier_net ?? 0), 0)
    lines.push(`已確認待付款：${pendingConfirm.length} 筆，NT$ ${totalConfirm.toLocaleString()}`)
  }

  // Stuck 儲值
  if (stuckTopup > 0) {
    const stuckAmt = Number((metrics.topupPending[0] as any)?.total ?? 0)
    lines.push(`\n超時儲值：${stuckTopup} 筆，NT$ ${stuckAmt.toLocaleString()}（pending 超過 3 小時）`)
  }

  // Claude 分析
  lines.push(`\nAI 分析`)
  lines.push(analysis)

  await pushLine(lines.join('\n'))

  return NextResponse.json({
    ok: true,
    platformDiff,
    mismatches: mismatches.length,
    pendingDraft: pendingDraft.length,
    stuckTopup,
    hasUrgent,
  })
}

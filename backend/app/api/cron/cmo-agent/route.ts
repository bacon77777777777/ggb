import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

// ─── Data gathering ──────────────────────────────────────────────────────────

async function gatherMarketingMetrics(supabase: any) {
  const q = (sql: string) => supabase.rpc('execute_readonly_sql', { query: sql }).then((r: any) => r.data ?? [])

  const [
    userGrowth,
    hotProducts,
    drawFunnel,
    pendingDrafts,
    recentCompetitor,
    productViews,
  ] = await Promise.all([

    // 近4週每週新用戶
    q(`
      SELECT
        to_char(date_trunc('week', created_at AT TIME ZONE 'Asia/Taipei'), 'YYYY-MM-DD') AS week_start,
        COUNT(*) AS new_users
      FROM users
      WHERE (is_bot IS NULL OR is_bot = false)
        AND created_at >= NOW() - INTERVAL '4 weeks'
      GROUP BY 1 ORDER BY 1
    `),

    // 近7天熱門商品（抽獎次數）
    q(`
      SELECT
        p.name, p.price, p.remaining, p.total_count,
        COUNT(dr.id) AS draw_count,
        COUNT(DISTINCT dr.user_id) AS unique_players
      FROM draw_records dr
      JOIN products p ON p.id = dr.product_id
      JOIN users u ON u.id = dr.user_id
      WHERE dr.created_at >= NOW() - INTERVAL '7 days'
        AND (u.is_bot IS NULL OR u.is_bot = false)
      GROUP BY p.id, p.name, p.price, p.remaining, p.total_count
      ORDER BY draw_count DESC
      LIMIT 5
    `),

    // 轉換漏斗：近7天 訪客 → 有抽獎用戶 → 有儲值用戶
    q(`
      SELECT
        (SELECT COUNT(DISTINCT user_id) FROM product_view_events
         WHERE created_at >= NOW() - INTERVAL '7 days') AS viewers,
        (SELECT COUNT(DISTINCT user_id) FROM draw_records dr
         JOIN users u ON u.id = dr.user_id
         WHERE dr.created_at >= NOW() - INTERVAL '7 days'
           AND (u.is_bot IS NULL OR u.is_bot = false)) AS drawers,
        (SELECT COUNT(DISTINCT user_id) FROM recharge_records
         WHERE status = 'success'
           AND created_at >= NOW() - INTERVAL '7 days'
           AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
        ) AS recharged
    `),

    // 待確認的文案草稿
    q(`
      SELECT id, draft_date, product_name, style, status
      FROM content_drafts
      WHERE status = 'pending'
      ORDER BY draft_date DESC
      LIMIT 10
    `),

    // 近2週競品動態
    q(`
      SELECT competitor, platform, content, created_at
      FROM competitor_posts
      WHERE created_at >= NOW() - INTERVAL '14 days'
      ORDER BY created_at DESC
      LIMIT 5
    `),

    // 近7天商品瀏覽熱度
    q(`
      SELECT
        p.name,
        COUNT(pve.product_id) AS views
      FROM product_view_events pve
      JOIN products p ON p.id = pve.product_id
      WHERE pve.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY p.id, p.name
      ORDER BY views DESC
      LIMIT 5
    `),
  ])

  return { userGrowth, hotProducts, drawFunnel, pendingDrafts, recentCompetitor, productViews }
}

// ─── Cross-unit intelligence (行銷 + 供應鏈 + 競品情報) ──────────────────────

async function gatherCrossUnitIntel(supabase: any, hotProducts: any[]) {
  if (hotProducts.length === 0) return null
  const q = (sql: string) => supabase.rpc('execute_readonly_sql', { query: sql }).then((r: any) => r.data ?? [])
  const top = hotProducts[0] as any

  const [competitorIntel, zeroStockActive] = await Promise.all([
    q(`
      SELECT competitor, platform, created_at
      FROM competitor_posts
      WHERE created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 6
    `),
    q(`
      SELECT name FROM products
      WHERE status = 'active' AND remaining = 0
      ORDER BY name LIMIT 5
    `),
  ])

  const drawVelocity = Number(top.draw_count ?? 0) / 7
  const daysLeft = drawVelocity > 0
    ? Math.round(Number(top.remaining ?? 0) / drawVelocity * 10) / 10
    : null
  const stockPct = Number(top.total_count ?? 0) > 0
    ? Math.round(Number(top.remaining) / Number(top.total_count) * 100)
    : 0

  return {
    topProduct:      top,
    stockPct,
    daysLeft,
    competitorIntel: competitorIntel as any[],
    zeroStockActive: zeroStockActive as any[],
  }
}

// ─── Claude analysis ──────────────────────────────────────────────────────────

async function analyzeWithClaude(metrics: any, isMonday: boolean): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return '（AI 分析不可用）'

  const client = new Anthropic({ apiKey })
  const funnel = (metrics.drawFunnel[0] ?? {}) as any

  const context = `
你是 GGB（吉吉比）轉蛋平台的 AI 行銷長，請根據以下數據用繁體中文寫出行銷洞察，${isMonday ? '150字' : '80字'}以內。
${isMonday ? '週報請指出本週最值得關注的一個機會與一個風險。' : '日報只需點出最值得注意的一個重點。'}
不要重複列出數字，直接給洞察與建議。

## 用戶成長（近4週每週新增）
${JSON.stringify(metrics.userGrowth)}

## 近7天熱門商品（抽獎次數）
${JSON.stringify(metrics.hotProducts)}

## 近7天轉換漏斗
訪客：${funnel.viewers ?? 0}  →  有抽獎：${funnel.drawers ?? 0}  →  有儲值：${funnel.recharged ?? 0}

## 近7天商品瀏覽熱度
${JSON.stringify(metrics.productViews)}

${isMonday && metrics.recentCompetitor.length > 0 ? `## 近期競品動態\n${JSON.stringify(metrics.recentCompetitor)}` : ''}
`.trim()

  const res = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages:   [{ role: 'user', content: context }],
  })

  return (res.content[0] as any)?.text ?? '（分析失敗）'
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
  const timeStr  = `${twNow.getUTCHours().toString().padStart(2,'0')}:${twNow.getUTCMinutes().toString().padStart(2,'0')}`

  const metrics    = await gatherMarketingMetrics(supabase)
  const crossUnit  = await gatherCrossUnitIntel(supabase, metrics.hotProducts as any[])
  const analysis   = await analyzeWithClaude(metrics, isMonday)

  const funnel  = (metrics.drawFunnel[0] ?? {}) as any
  const pending = metrics.pendingDrafts as any[]

  const lines: string[] = [`行銷長日報｜${timeStr}`]

  // 用戶成長
  const growth = metrics.userGrowth as any[]
  if (growth.length >= 2) {
    const lastWeek = Number(growth[growth.length - 1]?.new_users ?? 0)
    const prevWeek = Number(growth[growth.length - 2]?.new_users ?? 0)
    const delta = lastWeek - prevWeek
    const sign  = delta >= 0 ? '+' : ''
    lines.push(`\n本週新用戶：${lastWeek} 人（${sign}${delta} vs 上週）`)
  } else if (growth.length === 1) {
    lines.push(`\n本週新用戶：${growth[0].new_users} 人`)
  }

  // 轉換漏斗
  const viewers  = Number(funnel.viewers ?? 0)
  const drawers  = Number(funnel.drawers ?? 0)
  const recharged = Number(funnel.recharged ?? 0)
  if (viewers > 0 || drawers > 0) {
    lines.push(`近7天：${viewers} 瀏覽 → ${drawers} 抽獎 → ${recharged} 儲值`)
  }

  // 熱門商品
  const hot = metrics.hotProducts as any[]
  if (hot.length > 0) {
    lines.push(`\n近7天熱門`)
    hot.slice(0, 3).forEach((p: any) => {
      const stockPct = p.total_count > 0 ? Math.round(p.remaining / p.total_count * 100) : 0
      lines.push(`• ${p.name}：${p.draw_count} 抽（${p.unique_players} 人，剩 ${stockPct}%）`)
    })
  }

  // 待審文案草稿
  if (pending.length > 0) {
    lines.push(`\n待審文案：${pending.length} 則，請至後台確認。`)
  }

  // 競品動態
  if ((metrics.recentCompetitor as any[]).length > 0) {
    lines.push(`競品動態：${(metrics.recentCompetitor as any[]).length} 則新動態`)
  }

  // 跨部門行動建議
  if (crossUnit) {
    const { topProduct, stockPct, daysLeft, competitorIntel, zeroStockActive } = crossUnit
    const actions: string[] = []

    if (stockPct === 0) {
      actions.push('熱門商品已售完，暫停推廣')
    } else if (stockPct < 20) {
      actions.push('聯絡廠商補貨（庫存緊急）')
    } else if (stockPct < 40) {
      actions.push('預備補貨詢價（庫存偏低）')
    }

    if (competitorIntel.length > 0) {
      actions.push('加快文案出稿（競品本週活躍）')
    }

    if (zeroStockActive.length > 0) {
      actions.push(`停止推廣零庫存：${zeroStockActive.map((p: any) => p.name).join('、')}`)
    }

    const daysText = daysLeft !== null ? `，約 ${daysLeft} 天售完` : ''
    lines.push(`\n行動建議`)
    lines.push(`主力：${topProduct.name}（${topProduct.draw_count} 抽，庫存剩 ${stockPct}%${daysText}）`)

    if (actions.length > 0) {
      actions.forEach(a => lines.push(`• ${a}`))
    } else {
      lines.push('目前無問題')
    }
  }

  // AI 洞察
  lines.push(`\nAI 洞察`)
  lines.push(analysis)

  await pushLine(lines.join('\n'))

  return NextResponse.json({
    ok: true,
    isMonday,
    pendingDrafts: pending.length,
    hotProducts: hot.length,
  })
}

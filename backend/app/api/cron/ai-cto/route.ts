import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''

const DB_SCHEMA = `
users(id uuid, name, email, phone_number, tokens int, status, is_bot bool, created_at, last_login_at)
recharge_records(id, user_id, order_number, amount numeric, bonus numeric, status[success/pending/failed], created_at, payment_method)
draw_records(id, user_id, product_id, product_prize_id, prize_name, prize_level, status, created_at, points_used int)
products(id, name, price numeric, remaining int, total_count int, status[active/archived/sold_out], product_code)
product_prizes(id, product_id, name, level, remaining int, total int, probability numeric)
orders(id, user_id, order_id text, status[submitted/processing/shipping/delivered], total_amount, tracking_number, created_at)
settlement_snapshots(id, supplier_name, period_start, period_end, supplier_net numeric, total_g numeric, status[draft/confirmed/paid])
refund_requests(id, user_id, amount, status[pending/approved/rejected/processed], reason, created_at)
coupons(id, code, discount_amount, min_spend, status)
user_coupons(id, user_id, coupon_id, used_at, expiry_date)
competitor_posts(id, competitor, platform, content, url, created_at)
`.trim()

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

  const { data: gaps } = await supabase
    .from('capability_gaps')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)

  if (!gaps || gaps.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })

  const client = new Anthropic({ apiKey })
  const resolved: string[] = []
  const needsCode: string[] = []

  for (const gap of gaps) {
    let analysis: any = null

    try {
      const res = await client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `你是吉吉比轉蛋平台的 AI 技術長。

GB哥（AI 助理）無法回答以下問題：
問題：${gap.question}
嘗試情境：${gap.context ?? '未記錄'}

資料庫 Schema：
${DB_SCHEMA}

注意：
- 排除機器人：查 users 時加 WHERE (is_bot IS NULL OR is_bot = false)
- View 名稱用 vw_ 前綴，Function 用 fn_ 前綴

請判斷能否用 CREATE VIEW 或 CREATE OR REPLACE FUNCTION 解決，回覆純 JSON：
{
  "solvable": true/false,
  "explanation": "說明",
  "sql": "CREATE OR REPLACE VIEW vw_xxx AS ...",
  "reason": "若 solvable=false，說明為何需要 code 或無法解決"
}`,
        }],
      })

      const text = (res.content[0] as any)?.text ?? ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) analysis = JSON.parse(match[0])
    } catch (_) { /* ignore */ }

    if (analysis?.solvable && analysis?.sql) {
      try {
        const { error } = await supabase.rpc('execute_cto_sql', { ddl: analysis.sql })
        if (error) throw new Error(error.message)

        await supabase.from('capability_gaps').update({
          status:       'resolved',
          resolution:   analysis.explanation,
          sql_solution: analysis.sql,
          resolved_at:  new Date().toISOString(),
        }).eq('id', gap.id)

        resolved.push(gap.question)
      } catch (e: any) {
        await supabase.from('capability_gaps').update({
          status:      'needs_code',
          resolution:  `SQL 執行失敗：${e.message}`,
          resolved_at: new Date().toISOString(),
        }).eq('id', gap.id)
        needsCode.push(gap.question)
      }
    } else {
      await supabase.from('capability_gaps').update({
        status:      analysis ? 'needs_code' : 'needs_code',
        resolution:  analysis?.reason ?? '技術長無法分析',
        resolved_at: new Date().toISOString(),
      }).eq('id', gap.id)
      needsCode.push(gap.question)
    }
  }

  if (resolved.length > 0 || needsCode.length > 0) {
    const lines = ['🔧 AI技術長執行報告']
    if (resolved.length > 0) {
      lines.push(`\n✅ 自動修復 ${resolved.length} 個資料缺口`)
      resolved.forEach(q => lines.push(`• ${q.slice(0, 40)}`))
      lines.push('\n可以重新詢問 GB哥了。')
    }
    if (needsCode.length > 0) {
      lines.push(`\n📋 ${needsCode.length} 個問題需要手動開發，下週版本規劃時統一處理。`)
    }
    await pushLine(lines.join('\n'))
  }

  return NextResponse.json({ ok: true, resolved: resolved.length, needsCode: needsCode.length })
}

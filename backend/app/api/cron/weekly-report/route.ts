import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'
import { createLinePusher } from '@/lib/linePush'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const pushLine = createLinePusher('line_push_weekly')
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()

    // 台灣時間上週區間
    const now = new Date()
    const weekEnd = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
    weekStart.setUTCHours(0, 0, 0, 0)

    // 上週管理員操作記錄
    const { data: actionLogs } = await supabase
      .from('action_logs')
      .select('action, target_type, created_at, admin_id')
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString())
      .order('created_at', { ascending: false })
      .limit(100)

    // 上週 agent 事件
    const { data: agentEvents } = await supabase
      .from('agent_events')
      .select('title, body, severity, created_at, resolved_at')
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString())
      .order('severity', { ascending: false })
      .limit(30)

    // 上週新用戶數
    const { count: newUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekStart.toISOString())
      .or('is_bot.is.null,is_bot.eq.false')

    // 上週訂單數與收入
    const { data: recharges } = await supabase
      .from('recharge_records')
      .select('amount, type')
      .gte('created_at', weekStart.toISOString())
      .eq('status', 'success')

    const revenueTotal = (recharges || [])
      .filter((r: any) => r.type === 'recharge')
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0)

    const marketingTotal = (recharges || [])
      .filter((r: any) => ['marketing', 'compensation'].includes(r.type))
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0)

    // 上週抽獎次數
    const { count: drawCount } = await supabase
      .from('draw_records')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekStart.toISOString())
      .or('is_bot.is.null,is_bot.eq.false')

    // 未解決 agent 事件
    const { count: unresolvedEvents } = await supabase
      .from('agent_events')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null)

    // 待出貨數量
    const { count: pendingShipments } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'paid')

    // 整理 action 摘要
    const actionSummary = (actionLogs || []).reduce((acc: Record<string, number>, log: any) => {
      const key = `${log.action}/${log.target_type}`
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    const actionText = Object.entries(actionSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `  - ${k}：${v} 次`)
      .join('\n')

    const agentText = (agentEvents || [])
      .slice(0, 5)
      .map((e: any) => `  [${e.severity}] ${e.title}${e.resolved_at ? '（已解決）' : ''}`)
      .join('\n')

    const weekStartStr = weekStart.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric' })
    const weekEndStr = new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric' })

    const context = `
週報區間：${weekStartStr} ～ ${weekEndStr}

【業務數據】
- 新增真實用戶：${newUsers ?? 0} 人
- 抽獎次數：${(drawCount ?? 0).toLocaleString()} 次
- 真實儲值收入：NT$${revenueTotal.toLocaleString()}
- 補贈代幣：NT$${marketingTotal.toLocaleString()}
- 待出貨訂單：${pendingShipments ?? 0} 筆

【管理員操作（上週）】
${actionText || '  無'}

【AI 事件（上週前 5 筆）】
${agentText || '  無'}
- 未解決事件：${unresolvedEvents ?? 0} 筆
`.trim()

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `你是 GB哥，GGB 平台 AI 技術長。請根據以下數據，用繁體中文寫一份給老闆的週報 LINE 訊息。
風格：直接、清楚、重點摘要，不要廢話。標題用「📊 GB哥週報」開頭。
最後加一行「本週建議：」加上 1～2 個具體行動建議。

${context}`
      }]
    })

    const reportText = (msg.content[0] as any).text as string

    await pushLine(reportText)

    return NextResponse.json({ ok: true, report: reportText })
  } catch (err: any) {
    console.error('[weekly-report]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

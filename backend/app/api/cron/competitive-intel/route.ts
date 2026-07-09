import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createLinePusher } from '@/lib/linePush'
const pushLine = createLinePusher('line_push_market')

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''


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

  const periodEnd   = new Date()
  const periodStart = new Date(periodEnd.getTime() - 7 * 86400_000)

  // Fetch posts from the past week
  const { data: posts } = await supabase
    .from('competitor_posts')
    .select('competitor, platform, content, url, created_at')
    .gte('created_at', periodStart.toISOString())
    .order('created_at', { ascending: true })

  if (!posts || posts.length === 0) {
    await pushLine(`📊 競品週報｜本週無新增競品情報，略過分析。\n\n可透過後台「競品情報」頁面新增內容。`)
    return NextResponse.json({ ok: true, postCount: 0 })
  }

  // Build context for Claude
  const postsText = posts.map((p, i) =>
    `[${i + 1}] ${p.competitor}（${p.platform ?? '未標註平台'}）\n${p.content}${p.url ? `\n來源：${p.url}` : ''}`
  ).join('\n\n---\n\n')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY 未設定' }, { status: 500 })
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `你是吉吉比轉蛋平台（台灣收藏品抽獎平台）的市場情報分析師。

以下是本週蒐集到的競品社群內容，請整理成簡潔的市場動向摘要：

${postsText}

請分析：
1. 競品本週主打什麼商品或活動？
2. 有哪些值得參考的行銷手法？
3. 吉吉比有什麼差異化機會？

格式：條列式，每點一行，不超過 400 字。用繁體中文。`,
    }],
  })

  const analysis = (response.content[0] as any)?.text ?? '（分析失敗）'

  // Store report
  await supabase.from('competitor_reports').insert({
    period_start: periodStart.toISOString(),
    period_end:   periodEnd.toISOString(),
    post_count:   posts.length,
    analysis,
  })

  // Push to LINE (truncate if too long)
  const dateRange = `${periodStart.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })} – ${periodEnd.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}`
  const lineMsg = [
    `📊 競品週報 ${dateRange}`,
    `（分析 ${posts.length} 則情報）`,
    ``,
    analysis.length > 600 ? analysis.slice(0, 597) + '...' : analysis,
  ].join('\n')

  await pushLine(lineMsg)

  return NextResponse.json({ ok: true, postCount: posts.length, analysis })
}

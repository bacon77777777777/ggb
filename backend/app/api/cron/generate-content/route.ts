import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

const STYLES = ['promotional', 'story', 'urgency'] as const
type Style = typeof STYLES[number]

const STYLE_PROMPTS: Record<Style, string> = {
  promotional: '促銷型：強調限時優惠、低門檻、抽到賺到。語氣輕鬆活潑，附上 emoji，適合 IG/Threads 貼文。',
  story:       '故事型：描述商品的設計理念或IP背景，帶入玩轉蛋的期待感與收藏樂趣。語氣溫暖有情感。',
  urgency:     '緊迫感型：強調數量有限、先搶先得、錯過等很久。語氣帶緊張感，推動立即下單。',
}

// 行銷文案關鍵字 → 商品分類標籤建議
const CAMPAIGN_TAGS: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['1111', '雙十一', '單身節', '光棍'],  category: '1111 單身節特賣' },
  { keywords: ['聖誕', 'christmas', 'xmas'],         category: '聖誕節限定' },
  { keywords: ['跨年', '元旦'],                       category: '跨年特賣' },
  { keywords: ['新年', '過年', '春節', '農曆'],       category: '新年特賣' },
  { keywords: ['情人節', 'valentine'],               category: '情人節限定' },
  { keywords: ['618', '年中慶'],                     category: '618 年中慶' },
  { keywords: ['母親節'],                            category: '母親節限定' },
  { keywords: ['父親節'],                            category: '父親節限定' },
  { keywords: ['聯名', '聯乘', '聯合'],              category: '聯名款' },
  { keywords: ['新品', '新上市', '首發', '搶先'],    category: '新品上市' },
  { keywords: ['限時', '限定', '限量'],              category: '限定商品' },
  { keywords: ['特賣', '特惠', '降價', '打折'],      category: '限時特賣' },
]

function detectCampaignTags(texts: string[]) {
  const combined = texts.join(' ')
  return CAMPAIGN_TAGS
    .map(tag => ({ ...tag, matched: tag.keywords.filter(k => combined.includes(k)) }))
    .filter(tag => tag.matched.length > 0)
}

async function generateTextContent(productName: string, style: Style, competitorHint?: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return `[ANTHROPIC_API_KEY 未設定] ${productName} - ${style} 草稿`

  const client = new Anthropic({ apiKey })
  const competitorBlock = competitorHint
    ? `\n競品本週動態（參考趨勢，不要直接提及對手品牌）：\n${competitorHint}\n`
    : ''

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `你是吉吉比轉蛋平台的行銷文案撰寫員。請為以下商品撰寫一則社群貼文草稿（IG/Threads）。

商品名稱：${productName}
文案風格：${STYLE_PROMPTS[style]}
${competitorBlock}
要求：
- 字數約 80-150 字
- 附上相關 hashtag（3-5 個）
- 不要加「草稿」或「文案範例」等說明文字
- 直接輸出貼文內容`,
    }],
  })
  return (msg.content[0] as any)?.text ?? ''
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()

    const twNow      = new Date(Date.now() + 8 * 3600_000)
    const twYesterday = new Date(twNow)
    twYesterday.setUTCDate(twYesterday.getUTCDate() - 1)
    const draftDate = twYesterday.toISOString().slice(0, 10)

    const dayStart = new Date(Date.UTC(
      twYesterday.getUTCFullYear(), twYesterday.getUTCMonth(), twYesterday.getUTCDate(), 0, 0, 0
    ) - 8 * 3600_000)
    const dayEnd = new Date(dayStart.getTime() + 86400_000)

    const { data: topDraws } = await supabase
      .from('draw_records')
      .select('product_id')
      .gte('created_at', dayStart.toISOString())
      .lt('created_at',  dayEnd.toISOString())

    const countMap: Record<string, number> = {}
    for (const d of topDraws ?? []) {
      if (d.product_id) countMap[d.product_id] = (countMap[d.product_id] ?? 0) + 1
    }

    let productId: number | null = null
    let productName = '熱門商品'
    let priceLabel  = ''

    const sortedIds = Object.entries(countMap).sort((a, b) => b[1] - a[1]).map(([id]) => id)

    if (sortedIds.length > 0) {
      // 優先選有庫存的熱門商品（供應鏈信號：零庫存不出稿）
      let product = null
      for (const candidateId of sortedIds.slice(0, 5)) {
        const { data: p } = await supabase
          .from('products')
          .select('id, name, price, remaining')
          .eq('id', candidateId)
          .gt('remaining', 0)
          .maybeSingle()
        if (p) { product = p; break }
      }
      // Fallback：全都零庫存，仍取最熱門
      if (!product) {
        const { data: p } = await supabase
          .from('products')
          .select('id, name, price')
          .eq('id', sortedIds[0])
          .maybeSingle()
        product = p
      }
      if (product) {
        productId   = Number(product.id)
        productName = String(product.name)
        priceLabel  = `每抽 NT$${Number(product.price)}`
      }
    } else {
      const { data: product } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('status', 'active')
        .gt('remaining', 0)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (product) {
        productId   = Number(product.id)
        productName = String(product.name)
        priceLabel  = `每抽 NT$${Number(product.price)}`
      }
    }

    // 競品情報輔助背景
    const { data: competitorPosts } = await supabase
      .from('competitor_posts')
      .select('competitor, content')
      .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(3)

    const competitorHint = competitorPosts && competitorPosts.length > 0
      ? competitorPosts.map((p: any) => `- ${p.competitor}：${String(p.content ?? '').slice(0, 80)}`).join('\n')
      : undefined

    // 生成三種風格文案（純文字，不生成圖片）
    const results: Array<{ style: Style; textContent: string }> = []
    for (const style of STYLES) {
      const textContent = await generateTextContent(productName, style, competitorHint)
      results.push({ style, textContent })
    }

    const inserts = results.map(r => ({
      draft_date:   draftDate,
      product_id:   productId,
      product_name: productName,
      style:        r.style,
      text_content: r.textContent,
      status:       'pending',
    }))

    const { error } = await supabase.from('content_drafts').insert(inserts)
    if (error) throw error

    // ── Campaign 關鍵字偵測 → agent_events ──────────────────────────
    const detectedTags = detectCampaignTags(results.map(r => r.textContent))

    if (detectedTags.length > 0) {
      const eventInserts = detectedTags.map(tag => ({
        event_type:   'category_suggestion',
        source_agent: 'cmo',
        payload: {
          product_id:         productId,
          product_name:       productName,
          suggested_category: tag.category,
          matched_keywords:   tag.matched,
          draft_date:         draftDate,
        },
      }))
      await supabase.from('agent_events').insert(eventInserts)
    }

    // ── LINE 通知 ──────────────────────────────────────────────────
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
    const notifyId  = process.env.NOTIFY_TARGET_ID
    if (lineToken && notifyId) {
      const lines = [
        `📝 文案草稿已生成｜${draftDate}`,
        `商品：${productName}（${priceLabel}）`,
        `共 ${inserts.length} 則（促銷、故事、緊迫感）`,
        `請至後台「文案草稿」確認後標記發布。`,
      ]

      if (detectedTags.length > 0) {
        lines.push('')
        lines.push('🏷️ 行銷長偵測到節慶/活動關鍵字')
        detectedTags.forEach(tag => {
          lines.push(`• 「${tag.matched.join('、')}」→ 建議新增分類標籤「${tag.category}」`)
        })
        lines.push(`建議將《${productName}》加入上述分類，請至後台商品管理設定。`)
      }

      await fetch('https://api.line.me/v2/bot/message/push', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineToken}` },
        body:    JSON.stringify({ to: notifyId, messages: [{ type: 'text', text: lines.join('\n') }] }),
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, date: draftDate, productName, count: inserts.length, detectedTags: detectedTags.length })
  } catch (e: any) {
    console.error('[generate-content] error:', e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
